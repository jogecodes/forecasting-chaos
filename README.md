# Chaos — Prediction has hard limits

A local work in progress for Jorge Casajús-Setién's interactive chaos portfolio.
This folder is **not a Git repository**. There is no remote or deployment.

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
  animations of simulation and a genuine learned forecast. Physical / Phase
  space / Both remain available for exploration. Each system has three saved
  test runs, motion-error plots and RMSE summaries. One unstable pendulum rollout
  is explicitly stopped and marked incomplete; it is not silently omitted.
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

## Publishing later

The user is preparing Cloudflare hosting. When the local site is ready and a
repository is explicitly requested, it can be connected to Cloudflare Pages:

- Build command: `npm run build`
- Output directory: `dist`
- Root directory: this folder's root
- Environment: Node.js 22 or later
- No runtime secrets, server functions, or private-repository access required

Alternatively upload the **contents of `dist/`**, not the research directory, as
a static deployment. Relative asset URLs also support hosting in a subdirectory.
`_headers` configures security headers and revalidation of playback data on Pages.

This working folder intentionally has no Git setup or hosting identity. Build
and preview commands do not publish anything.

## Physical forecasting experiments

The two new residual MLPs were fitted locally with 32 training runs, four
validation runs and three test runs per system. The browser only replays exports;
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
