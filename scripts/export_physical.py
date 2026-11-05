"""Export the physical forecasts with explicit, unhidden rollout failures.

Uses original stored outputs, never refits or selects test examples. A numerical
support guard stops display once speed exceeds 10× the largest training speed,
or a wheel mass becomes negative. This guard is not a predictability threshold.
Full-horizon scores are unavailable for a stopped rollout, not scored as success.
"""
import argparse
import hashlib
import shutil
import json
from pathlib import Path
import numpy as np
from export_research import write_array, write_json

ROOT=Path(__file__).resolve().parents[1]


def export(artifacts):
    source_directory=artifacts/'source'
    source_directory.mkdir(exist_ok=True)
    code_hashes={}
    for name in ['train_physical.py','export_physical.py','export_research.py']:
        path=ROOT/'scripts'/name
        shutil.copyfile(path,source_directory/name)
        code_hashes[name]=hashlib.sha256(path.read_bytes()).hexdigest()
    experiments={}
    for slug in ['pendulum','waterwheel']:
        directory=artifacts/slug
        entry=json.loads((directory/'summary.json').read_text())
        backup=directory/'summary-before-display-guard.json'
        if not backup.exists():write_json(backup,entry)
        with np.load(directory/'data.npz') as source:train=source['train']
        with np.load(directory/'forecast.npz') as source:truth=source['truth'];predictions=source['prediction']
        speed_columns=[2,3] if slug=='pendulum' else [1]
        limits=10*np.max(np.abs(train[:,:,speed_columns]),axis=(0,1))
        scales=np.array(entry['trainingScales']);dt=entry['dt']
        entry['displayGuard']={'speedColumns':speed_columns,'speedLimits':limits.tolist(),'rule':'Stop before nonfinite state, speed over 10 times maximum training magnitude, or wheel bucket mass below -1e-5. Not a forecast-accuracy threshold.'}
        entry['codeHashes']=code_hashes
        entry['runs']=[]
        for i,(actual,prediction) in enumerate(zip(truth,predictions)):
            invalid=~np.isfinite(prediction).all(axis=1)|np.any(np.abs(prediction[:,speed_columns])>limits,axis=1)
            if slug=='waterwheel':invalid|=np.any(prediction[:,2:] < -1e-5,axis=1)
            failures=np.flatnonzero(invalid)
            stop=int(failures[0]) if len(failures) else len(actual)
            failure={'time':stop*dt,'reason':'Learned state left the numerical display guard; the rollout is not a completed forecast.'} if len(failures) else None
            actual=actual[:stop];prediction=prediction[:stop]
            error=prediction-actual
            nangle=2 if slug=='pendulum' else 1
            error[:,:nangle]=np.arctan2(np.sin(error[:,:nangle]),np.cos(error[:,:nangle]))
            error[0]=0
            normalized=np.sqrt(np.mean((error/scales)**2,axis=1))
            if slug=='pendulum':
                def xy(q):return np.column_stack([np.sin(q[:,0])+np.sin(q[:,1]),-np.cos(q[:,0])-np.cos(q[:,1])])
                mismatch=np.linalg.norm(xy(prediction)-xy(actual),axis=1)
            else:mismatch=np.abs(error[:,1])
            mismatch[0]=0
            n=round(1.8/dt)
            full=float(np.sqrt(np.mean(mismatch[1:]**2)))
            scores={'earlyMotionRmse':float(np.sqrt(np.mean(mismatch[1:n+1]**2))),
                    'motionRmse':None if failure else full,'savedMotionRmse':full,
                    'earlyNrmse':float(np.sqrt(np.mean((error[1:n+1]/scales)**2))),
                    'fullNrmse':None if failure else float(np.sqrt(np.mean((error[1:]/scales)**2))),
                    'rmseByState':np.sqrt(np.mean(error[1:]**2,axis=0)).tolist()}
            prefix=f'physical/{slug}/run-{i+1}'
            entry['runs'].append({'truth':write_array(ROOT/'data',prefix+'/truth',actual),
                                 'prediction':write_array(ROOT/'data',prefix+'/prediction',prediction),
                                 'mismatch':write_array(ROOT/'data',prefix+'/mismatch',mismatch),
                                 'normalizedError':write_array(ROOT/'data',prefix+'/normalized-error',normalized),
                                 'savedDuration':(len(actual)-1)*dt,'failure':failure,'scores':scores})
            print(slug,i+1,'saved',len(actual),'failure',failure,flush=True)
        write_json(directory/'summary.json',entry);experiments[slug]=entry
    manifest=json.loads((ROOT/'data/manifest.json').read_text())
    manifest['physicalForecasts']=experiments
    write_json(ROOT/'data/manifest.json',manifest)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--artifacts',type=Path,required=True)
    export(parser.parse_args().artifacts)
