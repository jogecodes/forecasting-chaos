# Chaos — Prediction has hard limits

Jorge Casajús-Setién's interactive chaos portfolio.
Repository: https://github.com/jogecodes/forecasting-chaos.
Cloudflare Workers Builds publishes production changes pushed to `main`.

The site is static HTML, CSS, and native JavaScript modules. Browser rendering
needs no Python service, GPU, database, third-party CDN, or JavaScript dependency.

## Run locally

Requires Node.js 22+ and Python 3 for the preview server:

```bash
npm test
npm run build
npm run preview
```

Open `http://localhost:8080`. Use HTTP; opening `index.html` as a file will not
load modules and playback assets correctly. Stop the server with Ctrl+C.

## Languages

The header offers ES / EN / FR. Language changes update prose, controls,
accessibility labels, dynamic model methods, diagnostics and canvas captions
without resetting an experiment. Every visit and reload starts in English,
regardless of browser language or past selections. ES / EN / FR remains
available for switching languages during the visit.
Scientific numbers, equations and simulation data are unchanged. Translations
are bundled locally in `src/locales/`; no external translation service is used.
Transformer is the default forecaster when opening either physical system.

## Experiences

- Lorenz sensitivity: a continuous logarithmic butterfly-effect slider,
  background-worker integration and synchronized 3D/x/separation views.
- Forecast laboratory: three systems, four active forecasters, reference plus
  four held-out ICs, all physical coordinates, three neural seed trajectories,
  short/full horizons, and a retrospective episode diagnostic with time-revealed markers. System
  and model introductions precede playback; a linked table afterward compares
  early/full normalized errors and coordinate RMSE for the selected trajectory.
- Physical systems: double pendulum and 24-bucket waterwheel only. Each starts
  with the mechanism and its explanation, then compares synchronized physical
  animations of simulation and a genuine learned forecast selected from polynomial dynamics, Transformer, GRU and residual MLP. Physical / Phase
  space / Both remain available for exploration. Each system has three saved
  test runs per model, motion-error plots and RMSE summaries. Invalid or unstable
  rollouts stop explicitly and remain visible as incomplete examples.
- Research case studies: data scaling, polynomial dynamics, PINN reconstruction
  versus extrapolation, and the development of breakdown/recovery diagnostics.

Interactive experiments have pause controls. The opening Lorenz illustration
runs automatically while visible, with no separate play/pause button, and uses
slower trace motion when the browser requests reduced motion. Offscreen and
hidden-tab playback pauses.
3D scenes rotate with pointer dragging or arrow keys when focused.

## Data and reproduction

`data/` is a deliberately selected **public playback export**, not a copy of the
private research results tree. It includes raw simulated states and model
forecasts, with SHA-256 hashes, settings, source commit, and sampling information
in `data/manifest.json`. It contains no checkpoints, credentials, or training
datasets. See [methods](docs/METHODS.md) and [findings](docs/CURRENT_FINDINGS.md).

To regenerate locally with the existing research checkout and its ignored saved
results available, install NumPy and SciPy in your research environment, then:

```bash
python scripts/export_research.py --research /path/to/chaos-private
npm test
npm run build
```

Exporting reads the private package and saved forecasts without changing them or
training models. Public-site building does **not** need the private checkout.
Archived gallery data are numerical illustrations, separate from the new physical forecasting
tests. The archived Lorenz pairs retain their original pre-quantization distance
exports. The continuous butterfly slider now uses Float64 browser integration;
its numerical method and limitations are documented separately.

## Publishing

Production is connected to this repository through Cloudflare Workers Builds.
A push to `main` triggers the build and deployment for `forecasting-chaos`.
`wrangler.jsonc` configures the Worker to serve static assets from `dist/`.

Before publishing:

```bash
npm test
npm run build
git add <reviewed-files>
git commit -m "Describe the change"
git push origin main
```

Check **Workers Builds: forecasting-chaos** on the pushed commit for the build
result. Build and preview commands alone do not publish anything. `dist/` is
ignored by Git and is generated during the build. No runtime secrets or access
to the private research repository are needed.

## Physical forecasting experiments

Each physical system now offers the same four model families as the forecast
laboratory: polynomial dynamics, Transformer, GRU and residual MLP. Select a
**Forecaster** above the comparison to change predictions, errors and methods.
All families use the same 32 training runs, four validation runs and three test
runs per system. The original MLP fits and outputs are preserved. The browser only replays exports;
it never trains or needs a GPU. Original section-03 research is unchanged.

Offline reproduction (NumPy, SciPy, PyTorch):

```bash
python scripts/train_physical.py --artifacts /absolute/path/to/a/new/run-directory
python scripts/export_physical.py --artifacts /absolute/path/to/existing/run-directory
npm test
npm run build
```

Artifacts are currently outside this folder in
`/app/more_studies/chaos-private/chaos-forecasting-ai/results/physical-forecasting/run-2026-11-05`. They include training
arrays, all original forecast outputs (including the unstable example), model
checkpoints, initial-state lists, validation histories, summaries, code snapshots
and an independent audit. The main data exporter preserves physical forecasts.


To reproduce the additional physical models from the original fixed data split
(the original artifacts are read only):

```bash
python scripts/train_physical_comparison.py --source /path/to/run-2026-11-05 --artifacts /path/to/new-comparison --system pendulum
python scripts/train_physical_comparison.py --source /path/to/run-2026-11-05 --artifacts /path/to/new-comparison --system waterwheel
python scripts/export_physical_comparison.py --source /path/to/run-2026-11-05 --artifacts /path/to/new-comparison
npm test
npm run build
```

The saved comparison artifacts are in
`/app/more_studies/chaos-private/chaos-forecasting-ai/results/physical-forecasting/comparison-2026-11-12`.
This directory contains the new checkpoints, reconstructed observed contexts,
validation histories and full outputs, including incomplete rollouts. Training
resumes completed model families when their summaries already exist; use a new
artifact directory to change settings. The original `train_physical.py` /
`export_physical.py` commands reproduce the earlier MLP-only experiment; use the
comparison exporter to publish all four physical model families locally.
