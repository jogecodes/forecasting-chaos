"""Export selected, existing forecasts and reproducible gallery simulations.

No training, metric selection, or modification of the source repository occurs.
Run with Python 3.10+, NumPy and SciPy. The private package is loaded read-only.
"""

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
MODELS = {
    "polynomial-dynamics": "Polynomial dynamics",
    "transformer": "Transformer",
    "gru": "GRU",
    "mlp": "MLP",
}
# Reference plus first window of each of the four other ICs, without ranking.
ORIGINS = [0, 1, 3, 5, 7]


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n")
    temporary.replace(path)


def forecast_scores(truth, mean, scales, dt):
    """Score stored physical-state forecasts; exclude the observed context."""
    error = np.asarray(mean, dtype=np.float64) - np.asarray(truth, dtype=np.float64)
    short_steps = min(180, len(error))
    return {
        "shortSteps": short_steps,
        "shortTime": short_steps * dt,
        "shortNormalizedRmse": float(np.sqrt(np.mean((error[:short_steps] / scales) ** 2))),
        "fullNormalizedRmse": float(np.sqrt(np.mean((error / scales) ** 2))),
        "rmseByState": np.sqrt(np.mean(error ** 2, axis=0)).tolist(),
        "maeByState": np.mean(np.abs(error), axis=0).tolist(),
    }


def write_array(output, name, values):
    values = np.asarray(values, dtype="<f4")
    if not np.isfinite(values).all():
        raise ValueError(f"Nonfinite exported array: {name}")
    path = output / f"{name}.f32"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(values.tobytes())
    return {
        "file": f"{name}.f32",
        "shape": list(values.shape),
        "bytes": path.stat().st_size,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }


def export_forecasts(research, output):
    base = research / "chaos-forecasting-ai/results/long-horizon-2026-11-05"
    systems = {}
    source_hashes = {}
    for system in ["lorenz", "rossler", "van-der-pol"]:
        run = base / system
        config = json.loads((run / "config.json").read_text())
        metrics = json.loads((run / "metrics.json").read_text())
        d = config["physical_size"]
        with np.load(run / "data.npz") as data:
            truth = data["truth"][:, :, :d]
            contexts = data["test_contexts"][:, :, :d]
            training_scales = data["train"][:, :, :d].std(axis=(0, 1))
        n = truth.shape[1]
        entry = {
            "dt": config["dt"], "dimensions": d, "labels": config["labels"],
            "samples": n, "horizon": config["long_units"],
            "displayHorizon": {"lorenz": 28, "rossler": 199, "van-der-pol": 27}[system],
            "trainingTrajectories": config["training_trajectories"],
            "trainingScales": training_scales.tolist(),
            "policy": metrics["Transformer"]["episode_coherence"]["policy"],
            "origins": [],
        }
        for origin in ORIGINS:
            prefix = f"forecasts/{system}/{origin}"
            origin_entry = {
                "index": origin,
                "label": "Reference IC" if origin == 0 else f"Held-out IC {(origin + 1) // 2}",
                "truth": write_array(output, f"{prefix}/truth", truth[origin]),
                "context": write_array(output, f"{prefix}/context", contexts[origin]),
                "models": {},
            }
            for slug, label in MODELS.items():
                source = run / f"{slug}.npz"
                source_hashes[f"{system}/{source.name}"] = hashlib.sha256(
                    source.read_bytes()
                ).hexdigest()
                with np.load(source) as data:
                    mean = data["mean"][origin, :, :d]
                    members = data["members"][:, origin, :, :d]
                    status = data["episode_status_by_origin"][origin]
                # Per-sample rows: mean, member 1..k, retrospective status.
                rows = np.column_stack([mean, *(m for m in members), status])
                episode = metrics[label]["episode_coherence"]
                origin_entry["models"][slug] = {
                    "label": label, "memberCount": len(members),
                    "values": write_array(output, f"{prefix}/{slug}", rows),
                    "onset": episode["onset_time_by_origin"][origin],
                    "confirmation": episode["confirmation_time_by_origin"][origin],
                    "censored": episode["censored_by_origin"][origin],
                    "episodes": episode["episodes_by_origin"][origin],
                    "scores": forecast_scores(truth[origin], mean, training_scales, config["dt"]),
                }
            entry["origins"].append(origin_entry)
        for name in ["config.json", "metrics.json", "data.npz"]:
            source_hashes[f"{system}/{name}"] = hashlib.sha256((run / name).read_bytes()).hexdigest()
        systems[system] = entry
    return systems, source_hashes


def export_gallery(output):
    from chaos_toy_models.electronics import chua
    from chaos_toy_models.flows import (
        duffing, forced_van_der_pol, integrate_flow, lorenz, rossler,
    )
    from chaos_toy_models.maps import henon, ikeda, iterate_map
    from chaos_toy_models.mechanics import double_pendulum
    from chaos_toy_models.population import forced_ricker, ricker
    from chaos_toy_models.wheel import DiscreteWaterwheel

    gallery = {}
    flows = [
        ("lorenz", lorenz, [1, 1, 1], 60, .01,
         {"sigma": 10, "rho": 28, "beta": 8/3}, ["x", "y", "z"]),
        ("rossler", rossler, [.1, 0, .1], 200, .04,
         {"a": .2, "b": .2, "c": 5.7}, ["x", "y", "z"]),
        ("chua", chua, [.1, 0, 0], 100, .02,
         {"alpha": 15.6, "beta": 28, "m0": -1.143, "m1": -.714}, ["x", "y", "z"]),
        ("pendulum", double_pendulum, [2, 1, 0, 0], 40, .01,
         {"length_1": 1, "length_2": 1, "mass_1": 1, "mass_2": 1, "gravity": 9.81},
         ["θ₁", "θ₂", "ω₁", "ω₂"]),
        ("van-der-pol", forced_van_der_pol, [.1, 0], 160, .02,
         {"mu": 3, "amplitude": 4.4, "forcing_frequency": 1.68}, ["x", "v"]),
        ("duffing", duffing, [.1, 0], 160, .02,
         {"delta": .2, "alpha": -1, "beta": 1, "gamma": .3, "omega": 1.2},
         ["x", "v"]),
    ]
    for slug, fn, initial, duration, dt, params, labels in flows:
        t, states = integrate_flow(fn, initial, (0, duration), dt=dt, **params)
        gallery[slug] = {
            "states": write_array(output, f"gallery/{slug}", states),
            "dt": dt, "labels": labels, "initial": initial, "parameters": params,
            "solver": "SciPy solve_ivp RK45, rtol=1e-9, atol=1e-11",
        }
    wheel = DiscreteWaterwheel()
    _, states = wheel.integrate(time_span=(0, 60), dt=.02)
    gallery["waterwheel"] = {
        "states": write_array(output, "gallery/waterwheel", states),
        "dt": .02, "bucketCount": wheel.bucket_count,
        "parameters": vars(wheel), "labels": ["θ", "ω", "bucket masses"],
        "solver": "SciPy solve_ivp RK45, rtol=1e-8, atol=1e-10",
    }
    for slug, fn, initial, params in [
        ("henon", henon, [0, 0], {"a": 1.4, "b": .3}),
        ("ikeda", ikeda, [0, 0], {"u": .918}),
        ("ricker", lambda s: np.array([ricker(float(s[0]))]), [.1], {"growth": 4}),
        ("forced-ricker", forced_ricker, [.1, 0],
         {"growth": 3.2, "forcing": .5, "phase_step": .7}),
    ]:
        states = iterate_map(fn, initial, 4000, discard=1000)
        gallery[slug] = {
            "states": write_array(output, f"gallery/{slug}", states),
            "dt": 1, "initial": initial, "parameters": params,
            "discard": 1000, "discrete": True,
            "labels": ["population", "phase"] if "ricker" in slug else ["x", "y"],
        }
    # Fixed IC and separate adaptive integrations for four perturbation magnitudes.
    pairs = {}
    separations = {}
    initial = np.array([1., 1., 1.])
    _, reference = integrate_flow(lorenz, initial, (0, 40), dt=.01, rtol=1e-11, atol=1e-13)
    for exponent in [-2, -4, -6, -8]:
        other_initial = initial + np.array([10.**exponent, 0, 0])
        _, other = integrate_flow(lorenz, other_initial, (0, 40), dt=.01, rtol=1e-11, atol=1e-13)
        pairs[str(exponent)] = write_array(
            output, f"sensitivity/lorenz-{abs(exponent)}", np.column_stack([reference, other])
        )
        # Compute tiny separations BEFORE Float32 coordinate quantization.
        separations[str(exponent)] = write_array(
            output, f"sensitivity/separation-{abs(exponent)}",
            np.linalg.norm(reference - other, axis=1),
        )
    return gallery, {
        "dt": .01, "initial": initial.tolist(), "pairs": pairs,
        "separations": separations,
        "separationPrecision": "Euclidean distances computed in Float64, then exported as Float32 scalars.",
        "solver": "Independent SciPy RK45 integrations, rtol=1e-11, atol=1e-13",
        "note": "Finite numerical illustration; not an estimate of an asymptotic exponent.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--research", type=Path, required=True)
    parser.add_argument("--forecasts-only", action="store_true",
                        help="Refresh saved forecast exports while retaining the existing gallery.")
    args = parser.parse_args()
    research = args.research.resolve()
    sys.path.insert(0, str(research / "src"))
    output = ROOT / "data"
    systems, hashes = export_forecasts(research, output)
    if args.forecasts_only:
        previous = json.loads((output / "manifest.json").read_text())
        gallery, sensitivity = previous["gallery"], previous["sensitivity"]
    else:
        gallery, sensitivity = export_gallery(output)
    commit = subprocess.check_output(
        ["git", "-C", str(research), "rev-parse", "HEAD"], text=True
    ).strip()
    manifest = {
        "schema": 1, "encoding": "little-endian float32, row-major",
        "researchCommit": commit, "run": "long-horizon-2026-11-05",
        "forecastTime": "Row i is lead (i+1)·dt after observed context; no truth resets.",
        "precision": "Stored states converted to Float32 for display. Episode events copied unchanged; summary errors computed from original stored forecasts using Float64 arithmetic.",
        "scoreDefinition": "Per displayed origin: coordinate RMSE/MAE and full-state RMSE normalized by pooled physical training standard deviations. Early window is first 180 forecast steps; full window is every saved forecast sample. Observed context is excluded.",
        "originSelection": "Reference plus first origin of each held-out IC (0,1,3,5,7); no score selection.",
        "sourceHashes": hashes, "systems": systems,
        "gallery": gallery, "sensitivity": sensitivity,
    }
    existing = output / "manifest.json"
    if existing.exists():
        physical = json.loads(existing.read_text()).get("physicalForecasts")
        if physical:
            manifest["physicalForecasts"] = physical
    write_json(output / "manifest.json", manifest)
    total = sum(p.stat().st_size for p in output.rglob("*") if p.is_file())
    print(f"Exported {total / 1e6:.2f} MB of static playback data. No training performed.")


if __name__ == "__main__":
    main()
