"""Reproducible small physical forecasting study; never modifies earlier runs.

Offline requirements: NumPy, SciPy, PyTorch. The published site only plays saved
arrays and needs none of these packages. All initial states are fixed before
fitting; checkpoints use validation runs only. No test-based selection.
"""
import os
os.environ.setdefault('CUBLAS_WORKSPACE_CONFIG', ':4096:8')
import argparse
import copy
import hashlib
import json
from pathlib import Path
import numpy as np
from scipy.integrate import solve_ivp
import torch
from torch import nn
from export_research import write_array, write_json

ROOT = Path(__file__).resolve().parents[1]


def pendulum_rhs(_t, q):
    a, b, u, v = q
    d = a - b
    den = 3 - np.cos(2*d)
    du = (-3*9.81*np.sin(a)-9.81*np.sin(a-2*b)-2*np.sin(d)*(v*v+u*u*np.cos(d)))/den
    dv = 2*np.sin(d)*(2*u*u+2*9.81*np.cos(a)+v*v*np.cos(d))/den
    return np.array([u, v, du, dv])


def wheel_rhs(_t, q):
    theta, omega = q[:2]
    angles = theta + np.arange(24)*2*np.pi/24
    weights = np.exp(.5*np.cos(angles));weights /= weights.sum()
    return np.r_[omega, 9.81*np.sum(q[2:]*np.sin(angles))-.8*omega, weights-.1*q[2:]]


def simulate(rhs, initial, duration, dt):
    n = round(duration/dt)
    result = solve_ivp(rhs, (0, duration), initial, t_eval=np.arange(n+1)*dt,
                       method='DOP853', rtol=1e-10, atol=1e-12)
    if not result.success or len(result.t) != n+1:
        raise RuntimeError(result.message)
    return result.y.T


def encode(q, slug):
    count = 2 if slug == 'pendulum' else 1
    return torch.cat([q[..., :count].sin(), q[..., :count].cos(), q[..., count:]], -1)


def differences(a, b, slug):
    e = a-b
    n = 2 if slug == 'pendulum' else 1
    e[..., :n] = np.arctan2(np.sin(e[..., :n]), np.cos(e[..., :n]))
    return e


def endpoint(q):
    return np.column_stack([np.sin(q[:, 0])+np.sin(q[:, 1]), -np.cos(q[:, 0])-np.cos(q[:, 1])])


def initial_states(slug):
    # Separate RNG streams; run lists are fixed before any model is fitted.
    def group(seed, n):
        rng=np.random.default_rng(seed)
        if slug == 'pendulum':
            return np.column_stack([rng.uniform(-2.6,2.6,(n,2)),rng.uniform(-.6,.6,(n,2))])
        return np.column_stack([rng.uniform(-np.pi,np.pi,n),rng.uniform(-.4,.4,n),rng.uniform(0,.025,(n,24))])
    reference=np.array([2.,1.,0.,0.]) if slug=='pendulum' else np.r_[.1,0.,np.zeros(24)]
    return {'train':group(1701,32),'validation':group(1702,4),'test':np.vstack([reference,group(1703,2)])}


def fit(slug, train, validation, dt, updates, device, output):
    torch.manual_seed(7);torch.cuda.manual_seed_all(7)
    q=torch.as_tensor(train,dtype=torch.float32,device=device)
    features=encode(q,slug);xmean=features.mean((0,1));xscale=features.std((0,1)).clamp_min(1e-4)
    delta=(q[:,1:]-q[:,:-1])/dt
    ymean=delta.mean((0,1));yscale=delta.std((0,1)).clamp_min(1e-4)
    state_scale=q.std((0,1)).clamp_min(1e-4)
    net=nn.Sequential(nn.Linear(features.shape[-1],128),nn.SiLU(),nn.Linear(128,128),nn.SiLU(),nn.Linear(128,q.shape[-1])).to(device)
    opt=torch.optim.AdamW(net.parameters(),lr=1e-3,weight_decay=1e-5)
    generator=torch.Generator(device=device).manual_seed(7)
    def step(state):
        return state+dt*(net((encode(state,slug)-xmean)/xscale)*yscale+ymean)
    v=torch.as_tensor(validation,dtype=torch.float32,device=device)
    horizon=180
    best=float('inf');best_weights=None;history=[]
    for update in range(1,updates+1):
        trajectories=torch.randint(len(q),(256,),generator=generator,device=device)
        starts=torch.randint(q.shape[1]-5,(256,),generator=generator,device=device)
        current=q[trajectories,starts];loss=0.
        # Recursive four-step loss: only the starting state comes from truth.
        for lead in range(1,5):
            current=step(current)
            loss=loss+(((current-q[trajectories,starts+lead])/state_scale)**2).mean()
        loss=loss/4
        opt.zero_grad(set_to_none=True);loss.backward();torch.nn.utils.clip_grad_norm_(net.parameters(),1.);opt.step()
        if update%400==0 or update==updates:
            with torch.no_grad():
                current=v[:,0];squared=0.
                for i in range(1,horizon+1):
                    current=step(current)
                    squared=squared+(((current-v[:,i])/state_scale)**2).mean()
                score=float(torch.sqrt(squared/horizon))
            history.append({'update':update,'trainingLoss':float(loss.detach()),'validationNrmse':score})
            if score<best:
                best=score;best_weights=copy.deepcopy(net.state_dict())
            print(slug,history[-1],flush=True)
    if best_weights is None:raise RuntimeError('No finite validation checkpoint')
    net.load_state_dict(best_weights);net.eval()
    torch.save({'weights':best_weights,'xmean':xmean,'xscale':xscale,'ymean':ymean,'yscale':yscale,'stateScale':state_scale},output/'model.pt')
    write_json(output/'training.json',{'history':history,'selectedValidationNrmse':best,'selection':'lowest validation 180-step rollout NRMSE; no test selection'})
    def forecast(initial,n):
        with torch.no_grad():
            current=torch.as_tensor(initial,dtype=torch.float32,device=device)
            values=[current.cpu().numpy().copy()]
            for i in range(n):
                current=step(current)
                if not torch.isfinite(current).all():raise RuntimeError(f'{slug} nonfinite forecast at {i}')
                values.append(current.cpu().numpy().copy())
        return np.stack(values,axis=1).astype(np.float64)
    return forecast,state_scale.cpu().numpy().astype(float)


def run(slug,args):
    destination=args.artifacts/slug
    if args.resume and (destination/'summary.json').exists():
        return json.loads((destination/'summary.json').read_text())
    destination.mkdir(parents=True,exist_ok=args.resume)
    groups=initial_states(slug)
    flattened=np.vstack(list(groups.values()))
    assert len(np.unique(flattened,axis=0))==len(flattened)
    write_json(destination/'initials.json',{k:v.tolist() for k,v in groups.items()})
    rhs=pendulum_rhs if slug=='pendulum' else wheel_rhs
    dt=.01 if slug=='pendulum' else .02
    warmup=4 if slug=='pendulum' else 12
    duration=25 if slug=='pendulum' else 45
    print(f'Generating {slug}: 32 training / 4 validation / 3 test runs',flush=True)
    if args.resume and (destination/'data.npz').exists():
        with np.load(destination/'data.npz') as cached:train=cached['train']
        (destination/'data.npz').rename(destination/'data-before-validation-length-fix.npz')
    else:
        train=np.stack([simulate(rhs,x,24,dt) for x in groups['train']])
    validation=np.stack([simulate(rhs,x,warmup+max(3,180*dt),dt)[round(warmup/dt):] for x in groups['validation']])
    truth=np.stack([simulate(rhs,x,warmup+duration,dt)[round(warmup/dt):] for x in groups['test']])
    np.savez_compressed(destination/'data.npz',train=train,validation=validation,truth=truth)
    forecast,scales=fit(slug,train,validation,dt,args.updates,args.device,destination)
    predicted=forecast(truth[:,0],truth.shape[1]-1)
    np.savez_compressed(destination/'forecast.npz',prediction=predicted,truth=truth)
    entry={'dt':dt,'duration':duration,'warmup':warmup,'dimensions':truth.shape[-1],
           'bucketCount':24 if slug=='waterwheel' else None,'model':'Residual MLP',
           'trainingRuns':32,'validationRuns':4,'testRuns':3,'seed':7,'updates':args.updates,
           'solver':'DOP853 rtol=1e-10 atol=1e-12','trainingScales':scales.tolist(),
           'method':'Predict state increments from sin/cos angles, velocities and (for the wheel) every bucket mass; 2 hidden layers of 128 SiLU units; four-step recursive loss; checkpoint selected on separate 180-step validation forecasts.',
           'runs':[]}
    for i,(actual,prediction) in enumerate(zip(truth,predicted)):
        error=differences(prediction.copy(),actual,slug)
        state_error=np.sqrt(np.mean((error/scales)**2,axis=1))
        mismatch=np.linalg.norm(endpoint(prediction)-endpoint(actual),axis=1) if slug=='pendulum' else np.abs(error[:,1])
        prefix=f'physical/{slug}/run-{i+1}'
        n=round(1.8/dt)
        scores={'earlyNrmse':float(np.sqrt(np.mean((error[1:n+1]/scales)**2))),
                'fullNrmse':float(np.sqrt(np.mean((error[1:]/scales)**2))),
                'motionRmse':float(np.sqrt(np.mean(mismatch[1:]**2))),
                'earlyMotionRmse':float(np.sqrt(np.mean(mismatch[1:n+1]**2))),
                'rmseByState':np.sqrt(np.mean(error[1:]**2,axis=0)).tolist(),
                'minPredictedMass':float(prediction[:,2:].min()) if slug=='waterwheel' else None}
        entry['runs'].append({'truth':write_array(ROOT/'data',prefix+'/truth',actual),
                              'prediction':write_array(ROOT/'data',prefix+'/prediction',prediction),
                              'mismatch':write_array(ROOT/'data',prefix+'/mismatch',mismatch),
                              'normalizedError':write_array(ROOT/'data',prefix+'/normalized-error',state_error),
                              'scores':scores})
        print(slug,'test',i+1,scores,flush=True)
    entry['sourceHashes']={name:hashlib.sha256((destination/name).read_bytes()).hexdigest() for name in ['data.npz','forecast.npz','model.pt','initials.json','training.json']}
    write_json(destination/'summary.json',entry)
    return entry


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--artifacts',type=Path,required=True)
    p.add_argument('--updates',type=int,default=3200)
    p.add_argument('--resume',action='store_true',help='Reuse completed systems and cached training arrays in this artifact directory.')
    p.add_argument('--device',default='cuda' if torch.cuda.is_available() else 'cpu')
    args=p.parse_args();torch.set_num_threads(2)
    args.artifacts.mkdir(parents=True,exist_ok=args.resume)
    write_json(args.artifacts/'config.json',{'updates':args.updates,'seed':7,'device':args.device,'systems':['pendulum','waterwheel'],'trainingDuration':24,'train':32,'validation':4,'test':3})
    experiments={slug:run(slug,args) for slug in ['pendulum','waterwheel']}
    manifest=json.loads((ROOT/'data/manifest.json').read_text())
    manifest['physicalForecasts']=experiments
    write_json(ROOT/'data/manifest.json',manifest)
    from export_physical import export
    export(args.artifacts)
    print('Exported genuine new physical forecasts. Earlier research files unchanged.',flush=True)

if __name__=='__main__':main()
