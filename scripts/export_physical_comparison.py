"""Export all four fitted physical forecasters, preserving incomplete rollouts.

The original MLP output is retained exactly. New models use identical test
origins. No training or test-based checkpoint selection occurs during export.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np

from export_research import write_array, write_json

ROOT = Path(__file__).resolve().parents[1]
FAMILIES = ('polynomial-dynamics', 'transformer', 'gru', 'mlp')


def export_run(slug, family, i, actual, prediction, config, limits):
    dt, scales = config['dt'], np.array(config['trainingScales'])
    columns = [2, 3] if slug == 'pendulum' else [1]
    invalid = ~np.isfinite(prediction).all(axis=1) | np.any(np.abs(prediction[:, columns]) > limits, axis=1)
    if slug == 'waterwheel':
        invalid |= np.any(prediction[:, 2:] < -1e-5, axis=1)
    failures = np.flatnonzero(invalid)
    stop = int(failures[0]) if len(failures) else len(actual)
    if stop < 1:
        raise ValueError('The exactly observed initial state must pass the display guard')
    failure = {'time': stop*dt, 'reason': 'Learned state left the numerical display guard; the rollout is not a completed forecast.'} if len(failures) else None
    actual, prediction = actual[:stop], prediction[:stop]
    error = prediction-actual
    count = 2 if slug == 'pendulum' else 1
    error[:, :count] = np.arctan2(np.sin(error[:, :count]), np.cos(error[:, :count]))
    error[0] = 0
    normalized = np.sqrt(np.mean((error/scales)**2, axis=1))
    if slug == 'pendulum':
        def tip(q):
            return np.column_stack([np.sin(q[:, 0])+np.sin(q[:, 1]), -np.cos(q[:, 0])-np.cos(q[:, 1])])
        mismatch = np.linalg.norm(tip(prediction)-tip(actual), axis=1)
    else:
        mismatch = np.abs(error[:, 1])
    mismatch[0] = 0
    n = round(1.8/dt)
    def rmse(values):
        return float(np.sqrt(np.mean(values**2))) if values.size else None
    full = rmse(mismatch[1:])
    scores = {'earlyMotionRmse': rmse(mismatch[1:n+1]) if stop > n else None,
              'motionRmse': None if failure else full, 'savedMotionRmse': full,
              'earlyNrmse': rmse(error[1:n+1]/scales) if stop > n else None,
              'fullNrmse': None if failure else rmse(error[1:]/scales),
              'rmseByState': np.sqrt(np.mean(error[1:]**2, axis=0)).tolist() if stop > 1 else None}
    prefix = f'physical/{slug}/{family}/run-{i+1}'
    return {**{key: write_array(ROOT/'data', prefix+'/'+name, value) for key, name, value in [
                ('truth', 'truth', actual), ('prediction', 'prediction', prediction),
                ('mismatch', 'mismatch', mismatch), ('normalizedError', 'normalized-error', normalized)]},
            'savedDuration': (stop-1)*dt, 'failure': failure, 'scores': scores}


def export(source, artifacts):
    experiments = {}
    code_hashes = {name: hashlib.sha256((ROOT/'scripts'/name).read_bytes()).hexdigest()
                   for name in ['train_physical_comparison.py', 'export_physical_comparison.py', 'train_physical.py']}
    for slug in ['pendulum', 'waterwheel']:
        directory = artifacts/slug
        config = json.loads((directory/'system.json').read_text())
        with np.load(directory/'data.npz') as data:
            train, truth = data['train'], data['truth']
        columns = [2, 3] if slug == 'pendulum' else [1]
        limits = 10*np.max(np.abs(train[:, :, columns]), axis=(0, 1))
        for key in ['runs', 'model', 'method', 'seed', 'updates', 'sourceHashes']:
            config.pop(key, None)
        config['codeHashes'] = code_hashes
        config['models'] = {}
        config['contextSamples'] = 24
        config['comparisonArtifacts'] = str(artifacts)
        for family in FAMILIES:
            if family == 'mlp':
                original = source/slug
                legacy = json.loads((original/'summary.json').read_text())
                info = {key: legacy[key] for key in ['seed', 'updates', 'method', 'sourceHashes']}
                info.update(label='Residual MLP', window=1)
                forecast_path = original/'forecast.npz'
            else:
                info = json.loads((directory/family/'summary.json').read_text())
                info.pop('history', None)
                forecast_path = directory/family/'forecast.npz'
            with np.load(forecast_path) as data:
                prediction = data['prediction']
                np.testing.assert_array_equal(data['truth'], truth)
            info['forecastSha256'] = hashlib.sha256(forecast_path.read_bytes()).hexdigest()
            info['runs'] = [export_run(slug, family, i, actual, predicted, config, limits)
                            for i, (actual, predicted) in enumerate(zip(truth, prediction))]
            config['models'][family] = info
            print(slug, family, [(r['savedDuration'], r['failure']) for r in info['runs']], flush=True)
        write_json(directory/'comparison.json', config)
        experiments[slug] = config
    # Publish the manifest only after all models and arrays have been verified.
    manifest = json.loads((ROOT/'data/manifest.json').read_text())
    manifest['physicalForecasts'] = experiments
    write_json(ROOT/'data/manifest.json', manifest)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--artifacts', type=Path, required=True)
    args = parser.parse_args()
    export(args.source, args.artifacts)
