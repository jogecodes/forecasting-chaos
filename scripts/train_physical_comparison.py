"""Fit additional physical forecasters on the original fixed train/validation/test split.

Requires NumPy, SciPy and PyTorch. Source artifacts are read only. Each system
writes to its own new output directory; export only after both systems finish.
"""
import argparse
import copy
import hashlib
import json
import math
import shutil
from itertools import combinations_with_replacement
from pathlib import Path

import numpy as np
import torch
from torch import nn

from train_physical import encode, simulate, pendulum_rhs, wheel_rhs
from export_research import write_json

ROOT = Path(__file__).resolve().parents[1]
FAMILIES = ('polynomial-dynamics', 'transformer', 'gru')


class SequenceModel(nn.Module):
    def __init__(self, family, slug, train, dt):
        super().__init__()
        self.slug, self.dt, self.family = slug, dt, family
        features = encode(train, slug)
        delta = (train[:, 1:] - train[:, :-1]) / dt
        for name, value in [('xmean', features.mean((0, 1))),
                            ('xscale', features.std((0, 1)).clamp_min(1e-4)),
                            ('ymean', delta.mean((0, 1))),
                            ('yscale', delta.std((0, 1)).clamp_min(1e-4))]:
            self.register_buffer(name, value)
        size, out = features.shape[-1], train.shape[-1]
        if family == 'gru':
            self.encoder = nn.GRU(size, 64, num_layers=2, batch_first=True)
            self.output = nn.Linear(64, out)
        else:
            self.input = nn.Linear(size, 48)
            position = torch.arange(24)[:, None]
            rates = torch.exp(torch.arange(0, 48, 2) * (-math.log(10000.) / 48))
            encoding = torch.zeros(24, 48)
            encoding[:, 0::2] = torch.sin(position * rates)
            encoding[:, 1::2] = torch.cos(position * rates)
            self.register_buffer('position', encoding)
            layer = nn.TransformerEncoderLayer(48, 4, 96, dropout=0., batch_first=True)
            self.encoder = nn.TransformerEncoder(layer, 2, enable_nested_tensor=False)
            for block in self.encoder.layers:
                for parameter in block.parameters():
                    if parameter.ndim > 1:
                        nn.init.xavier_uniform_(parameter)
            self.output = nn.Linear(48, out)
        nn.init.zeros_(self.output.weight)
        nn.init.zeros_(self.output.bias)

    def forward(self, history):
        values = (encode(history, self.slug) - self.xmean) / self.xscale
        if self.family == 'gru':
            hidden, _ = self.encoder(values)
        else:
            hidden = self.encoder(self.input(values) + self.position)
        return history[:, -1] + self.dt * (self.output(hidden[:, -1]) * self.yscale + self.ymean)


def neural_rollout(model, contexts, horizon):
    model.eval()
    with torch.no_grad():
        history = torch.as_tensor(contexts, dtype=torch.float32, device=model.xmean.device)
        output = [history[:, -1].cpu().numpy().copy()]
        for _ in range(horizon):
            predicted = model(history)
            output.append(predicted.cpu().numpy().copy())
            history = torch.cat([history[:, 1:], predicted[:, None]], dim=1)
    return np.stack(output, axis=1).astype(float)


def fit_neural(family, slug, train, contexts, validation, scales, dt, args, directory):
    torch.manual_seed(7)
    q = torch.as_tensor(train, dtype=torch.float32, device=args.device)
    model = SequenceModel(family, slug, q, dt).to(args.device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-5)
    state_scale = torch.as_tensor(scales, dtype=torch.float32, device=args.device)
    lags = torch.arange(-23, 1, device=args.device)
    generator = torch.Generator(device=args.device).manual_seed(7)
    best, weights, history, selected = float('inf'), None, [], None
    for update in range(1, args.updates + 1):
        model.train()
        trajectories = torch.randint(len(q), (256,), generator=generator, device=args.device)
        starts = torch.randint(23, q.shape[1]-4, (256,), generator=generator, device=args.device)
        window = q[trajectories[:, None], starts[:, None] + lags]
        loss = 0.
        for lead in range(1, 5):
            current = model(window)
            loss = loss + (((current-q[trajectories, starts+lead])/state_scale)**2).mean()/4
            window = torch.cat([window[:, 1:], current[:, None]], dim=1)
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1., error_if_nonfinite=True)
        optimizer.step()
        if update % 400 == 0 or update == args.updates:
            predicted = neural_rollout(model, contexts, 180)
            score = validation_score(predicted, validation[:, :181], scales, slug)
            history.append({'update': update, 'trainingLoss': float(loss.detach()), 'validationNrmse': score if np.isfinite(score) else None})
            if score < best:
                best, weights, selected = score, copy.deepcopy(model.state_dict()), update
            print(slug, family, history[-1], flush=True)
    if weights is None:
        raise RuntimeError(f'No finite validation checkpoint: {slug}/{family}')
    model.load_state_dict(weights)
    torch.save(weights, directory/'model.pt')
    info = {'label': 'Transformer' if family == 'transformer' else 'GRU', 'seed': 7,
            'updates': args.updates, 'selectedUpdate': selected, 'window': 24,
            'validationNrmse': best, 'history': history,
            'method': ('Two attention encoder layers, width 48, four heads, feed-forward width 96, sinusoidal positions.' if family == 'transformer' else 'Two GRU layers of 64 units.') + ' Reads 24 states with sine/cosine angles; predicts full-state increments; four-step recursive loss; AdamW, batch 256; checkpoint selected on separate 180-step validation forecasts.'}
    return model, info


def angular_features(q, slug):
    count = 2 if slug == 'pendulum' else 1
    return np.concatenate([np.sin(q[..., :count]), np.cos(q[..., :count]), q[..., count:]], axis=-1)


def validation_score(predicted, truth, scales, slug):
    if not np.isfinite(predicted).all():
        return float('inf')
    error = predicted[:, 1:] - truth[:, 1:]
    count = 2 if slug == 'pendulum' else 1
    error[..., :count] = np.arctan2(np.sin(error[..., :count]), np.cos(error[..., :count]))
    return float(np.sqrt(np.mean((error/scales)**2)))


class Polynomial:
    """Quadratic dynamics on periodic angle features; coefficients learned from data."""
    def __init__(self, train, dt, slug):
        self.slug, self.dt = slug, dt
        x = angular_features(train, slug)
        self.mean, self.scale = x.mean((0, 1)), np.maximum(x.std((0, 1)), 1e-4)
        self.terms = [()] + [(i,) for i in range(x.shape[-1])] + list(combinations_with_replacement(range(x.shape[-1]), 2))
        derivative = (train[:, :-4] - 8*train[:, 1:-3] + 8*train[:, 3:-1] - train[:, 4:])/(12*dt)
        features = self.features(train[:, 2:-2]).reshape(-1, len(self.terms))
        targets = derivative.reshape(-1, train.shape[-1])
        self.coefficients = np.linalg.lstsq(features, targets, rcond=1e-8)[0]

    def features(self, q):
        x = (angular_features(q, self.slug)-self.mean)/self.scale
        return np.stack([np.prod(x[..., term], axis=-1) if term else np.ones(x.shape[:-1]) for term in self.terms], axis=-1)

    def rollout(self, contexts, horizon):
        state = contexts[:, -1].copy()
        output = [state.copy()]
        active = np.ones(len(state), dtype=bool)
        def f(q):
            return self.features(q) @ self.coefficients
        step = self.dt/4
        for _ in range(horizon):
            for _ in range(4):
                ids = np.flatnonzero(active)
                if not len(ids):
                    break
                q = state[ids]
                with np.errstate(over='ignore', invalid='ignore'):
                    a = f(q); b = f(q+step*a/2); c = f(q+step*b/2); d = f(q+step*c)
                    result = q+step*(a+2*b+2*c+d)/6
                finite = np.isfinite(result).all(axis=1) & (np.abs(result).max(axis=1) < 1e8)
                state[ids[finite]] = result[finite]
                active[ids[~finite]] = False
            value = state.copy();value[~active] = np.nan
            output.append(value)
        return np.stack(output, axis=1)


def run(args):
    slug = args.system
    target = args.artifacts/slug
    target.mkdir(parents=True, exist_ok=True)
    original = args.source/slug
    entry = json.loads((original/'summary.json').read_text())
    with np.load(original/'data.npz') as data:
        train, validation, truth = data['train'], data['validation'], data['truth']
    scales, dt = np.array(entry['trainingScales']), entry['dt']
    initials = json.loads((original/'initials.json').read_text())
    rhs = pendulum_rhs if slug == 'pendulum' else wheel_rhs
    warmup = entry['warmup']
    # Reconstruct genuine observed contexts ending at the unchanged forecast origin.
    contexts = {}
    for split in ['validation', 'test']:
        paths = np.stack([simulate(rhs, x, warmup+(max(3,180*dt) if split=='validation' else entry['duration']), dt) for x in initials[split]])
        origin = round(warmup/dt)
        contexts[split] = paths[:, origin-23:origin+1]
        expected = validation if split == 'validation' else truth
        np.testing.assert_allclose(paths[:, origin:], expected, rtol=1e-10, atol=1e-10)
    np.savez_compressed(target/'contexts.npz', **contexts)
    shutil.copyfile(original/'data.npz', target/'data.npz')
    shutil.copyfile(original/'initials.json', target/'initials.json')
    write_json(target/'system.json', entry)
    for family in FAMILIES:
        directory = target/family
        directory.mkdir(exist_ok=True)
        if (directory/'summary.json').exists():
            continue
        if family == 'polynomial-dynamics':
            model = Polynomial(train, dt, slug)
            predicted = model.rollout(contexts['test'], truth.shape[1]-1)
            validation_prediction = model.rollout(contexts['validation'], 180)
            score = validation_score(validation_prediction, validation[:, :181], scales, slug)
            np.savez_compressed(directory/'model.npz', mean=model.mean, scale=model.scale, coefficients=model.coefficients)
            info = {'label': 'Polynomial dynamics', 'degree': 2, 'window': 1,
                    'validationNrmse': score if np.isfinite(score) else None,
                    'method': 'Quadratic polynomial derivatives fitted by least squares (rcond 1e-8) on training trajectories, using sine/cosine angles and standardized state features. Fourth-order finite-difference training targets; RK4 integration with four substeps per sample. Degree fixed before test evaluation; no physical equation coefficients supplied.'}
        else:
            model, info = fit_neural(family, slug, train, contexts['validation'], validation, scales, dt, args, directory)
            predicted = neural_rollout(model, contexts['test'], truth.shape[1]-1)
        # Preserve the exactly observed origin for all models, including Float32 nets.
        predicted[:, 0] = truth[:, 0]
        np.savez_compressed(directory/'forecast.npz', truth=truth, prediction=predicted)
        info['sourceHashes'] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in [original/'data.npz', original/'initials.json', target/'contexts.npz']}
        info['artifactHashes'] = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in directory.iterdir() if p.is_file()}
        write_json(directory/'summary.json', info)
        print(slug, family, 'saved', flush=True)
    source_dir = target/'source';source_dir.mkdir(exist_ok=True)
    for name in ['train_physical_comparison.py', 'export_physical_comparison.py', 'train_physical.py', 'export_physical.py', 'export_research.py']:
        shutil.copyfile(ROOT/'scripts'/name, source_dir/name)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--artifacts', type=Path, required=True)
    parser.add_argument('--system', choices=['pendulum', 'waterwheel'], required=True)
    parser.add_argument('--updates', type=int, default=3200)
    parser.add_argument('--device', default='cuda')
    args = parser.parse_args()
    torch.set_num_threads(2)
    run(args)
