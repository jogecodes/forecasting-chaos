# Local development state

Plain local folder: no Git initialization, remote, or deployment. Build with
`npm run build`, then refresh the existing local preview. If none is running,
use `npm run preview` (port 8080).

## Interaction additions — 2026-11-05

- Continuous logarithmic butterfly-effect slider, Float64 Lorenz integration in
  a background worker, and an explicit first 1-unit separation readout.
- Interactive logistic bifurcation diagram, linked cobweb and population trace,
  zoom presets, pointer/touch/keyboard selection, and atlas growth linking.
- Physical / Phase space / Both modes for pendulum and bucket waterwheel, with
  shared simulation time, playback, and scrubbing. Dual panels stack on phones.
  Projection coordinates are explicitly standardized for display.

Numerics: `src/dynamics.js`. Worker: `src/sensitivity-worker.js`. Bifurcation
controller: `src/bifurcation.js`. Scientific methods/limits: `METHODS.md`.

Sixteen automated checks cover numerical/asset integrity, RK4 convergence,
short-window agreement with independent SciPy results, tiny perturbations,
first passage, known logistic cycles, and physical projection formulas.

Chromium interaction checks covered 1440x1100, 320x700, 390x844, 768x1024, and
844x390 viewports with no runtime/network errors or horizontal overflow. The
original 60-case forecast selection regression also passes. These are browser
emulations, not physical-device or Safari checks. No archived forecasts,
research metrics, or training were changed.

Temporary QA scripts and libraries live under `/tmp/chaos-browser`, outside the
site. Screenshots are saved under `preview/` and excluded from the build. An
existing preview on port 8080 was preserved; this task's QA uses port 8081.

## Truncated JSON loading fix

A browser reported incomplete manifest JSON while the local preview was open.
Both source/build JSON and the live HTTP response were valid on inspection;
the old build deleted and copied served files in place, allowing partial reads
during rebuilding. Builds now stage all files, validate JSON, and atomically
replace individual files, publishing the manifest and HTML after assets. Older
assets remain available to already-open tabs. Failed JSON validation leaves the
previous build untouched. The browser fetches manifest data with `no-store` and
retries incomplete/invalid responses up to three times.

Tests cover truncated-response recovery, bounded failure, concurrent readers
during rebuilding, and preservation of the previous build. Chromium recovered
from an intentionally truncated first response. Sixty complete HTTP manifest
reads succeeded during two live rebuilds on the existing port-8080 preview.
No server restart was needed; a hard refresh picks up the fixed loader.

## Copy and opening animation

At the owner's request, supporting slogans and fragmented section headings were
rewritten as natural descriptions and questions. The owner selected “Prediction
has hard limits.” with the subtitle “A study using simulations and machine
learning to explore why some systems are so hard to predict.” Repeated singular
first-person wording was removed. The Lorenz caption introduces the attractor
as an early landmark of modern chaos theory, links to the MIT Lorenz Center's
historical account, and ends “We’ll get into that later.” The opening
Lorenz play/pause control was removed: the illustration runs while visible,
pauses outside the viewport/hidden tab, and uses a slower advancing trace for
reduced-motion preferences, including changes during the visit. The reduced-motion
branch previously froze the trace after the manual button was removed;
the hero now always advances while visible, with a clearer glowing head marker.
Its frame loop starts as soon as the hero data loads, independently of the
remaining experiments. The caption ends “We’ll get into that later on…”. Experiment controls stay
available for inspecting results.

## Section 02: Lorenz introduction and overlapping trajectories

Added context for Lorenz's 1963 three-equation study, linked to the MIT Lorenz
Center's historical account. The text explicitly introduces running two nearly
identical initial states, why both paths can initially look like one, and what
to watch during divergence. The chapter title is retained.

Both plots now render A as wider solid green and B as thinner dashed orange,
with a persistent style legend. A ring and B diamond markers remain visible
when the two projected positions coincide. No data or state coordinates move
to create fake separation. This is a rendering change only; solver settings,
forecasts, and scientific metrics are unchanged.

The owner subsequently supplied the full section 02 prose and title, “What
happens when things start out a bit differently?”. These are used as supplied.
The three general Lorenz equations were typeset from LaTeX into static MathML
with KaTeX 0.19.1 used only in a temporary development directory. The embedded
LaTeX annotation preserves their source. Native browser math rendering needs no
additional client JavaScript, CDN, or new npm dependencies. STIX Two Math is
bundled locally with its SIL Open Font License so Greek math glyphs render even
on devices without installed mathematics fonts.
The longer introduction uses a readable single-column layout above the existing
overlap-aware experiment. Existing controls, solver, and scientific data are unchanged.

Equation styling was subsequently reduced to 18px (17px on phones), with the
divider lines removed. Each equation has its own static LaTeX/MathML block in
a wrapping flex row, so they sit side by side where space permits and wrap
naturally on narrower screens.

The owner subsequently removed the “FIRST 1-UNIT SEPARATION” readout and its
explanatory panel. The matching vertical threshold marker is removed from the
separation plot as well. The slider, logarithmic separation curve, initial-overlap
legend, and both trajectories remain. Rendering no longer accesses the removed
DOM elements; the source numerical helper remains independently tested.

## Standalone section 02b removed

At the owner's request, the standalone bifurcation chapter and controller were
removed so the narrative moves from sensitivity to the forecasting problem.
The logistic map remains in the atlas; its growth control updates its own
cobweb directly. Runtime references, chapter styles, active feature list, and
current methods were updated. Pure numerical helpers remain tested. Historical
notes above describe earlier iterations rather than the current site structure.

## Forecast chapter explanations and results

Section 02 now uses a single “State space / x, y, z · Drag to rotate” hint;
keyboard instructions remain in the canvas accessible label. The interlude uses
“Even an analytical model faces the first.” Section 03 introduces Lorenz,
Rössler, and forced Van der Pol as known-ODE simulations, with the reference
trajectory produced by numerical integration. Physical toy models follow in 04.
The four forecasting-method explanations now precede the player.

“Starting trajectory” replaces “Initial condition”, with reference/test-trajectory
labels and contextual help about shared observed histories and forecast starts.
A results table after playback compares all four models for that selected system
and trajectory: early normalized RMSE (180 steps), full-horizon normalized RMSE,
and full-horizon RMSE for the plotted coordinate. Model selection highlights the
matching row; coordinate selection updates RMSE. Plot window and playback time
do not change the saved-horizon scores. The table fits narrow phone screens.

The exporter computes these summaries using original saved forecasts and Float64
arithmetic; --forecasts-only refreshes forecast exports without regenerating the
gallery. No training or original research-output changes occurred. Seventeen
automated tests include independent reproduction of all 60 score cases within
Float32 display precision. Browser checks cover table selections and mobile
layouts; the source manifest includes the full unrounded values and provenance.

## Stacked forecast plots and retrospective marker reveal

Removed the coordinate selector: all physical coordinates now have vertically
stacked time-series plots below the full-width state-space plot. The score table
lists every coordinate RMSE. Simulation run replaces Starting trajectory and
shows the state at the forecast origin; changing runs selects saved examples
with different initial states and does not retrain models. Individual neural
seed trajectories default visible, controlled by an accessible eye button above
the coordinate plots. The same toggle controls state-space members and remains
consistent across run/system/model changes; polynomial fits disable it.

The retrospective diagnostic is always enabled. Its strip, event timing text
and shared vertical onset/confirmation lines reveal only through the replay
position, including on rewind. Coral solid lines mark backdated sustained
onset; gray dashed lines mark later confirmation. A visible legend explains
colors/line styles; copy retains the future-evidence limitation. Original saved
episode records and model outputs are unchanged. Two marker tests cover exact
event times, absent/out-of-window events and rewind; all 19 tests pass.

### Subsequent player simplification

Replay now always uses the comparison horizon; its selector is removed. Run
labels are simply Run 1–5 and help text omits starting coordinates. The eye
control is borderless. Axis ranges include truth, mean and every member even
when members are hidden, preserving tick values and curve scale on toggles.
Onset/confirmation line keys live above the coordinate plots; the retrospective
status panel retains only tracking/temporary/sustained color keys.

## Section 04: physical mechanisms and genuine forecasts

Replaced the eleven-item atlas UI with two choices: double pendulum and
24-bucket waterwheel. Each selection presents an explanation and physical
animation first (phase views still available), then a separate saved forecasting
experiment with synchronized simulation/MLP physical animations, three test
runs, play/pause/reset/speed/scrub, motion/error plots and early/full RMSE.
Source model catalog now contains only those mechanisms; archived gallery data
remain intact. Removed unrelated logistic/discrete rendering and listeners.

Created scripts/train_physical.py and export_physical.py. New offline study:
32 training / 4 validation / 3 test initial states per system, no overlap, one
seed (7), 2×128 residual MLP, 3,200 updates, recursive four-step loss and
180-step validation checkpoint selection. Runtime remains static playback.
Artifacts and original full outputs/checkpoints live outside the website in
/app/more_studies/chaos-physical-experiments/run-2026-11-05; prior research is
untouched. Fixed an initial waterwheel validation-duration error before that
fit completed; preserved the earlier cache and completed pendulum fit.

The second pendulum test becomes unstable at 5.16 s. It is retained, display
stops before the out-of-support speed, and full-horizon scores read Not
completed. No test examples are dropped or reranked. Other pendulum forecasts
complete 25 s; all waterwheel forecasts complete 45 s. A numerical display guard
is explicit and separate from section-03 breakdown policy. The UI does not
claim those test cases are still blind after development inspection.

Audits: 200 RHS comparisons to original equations, 39 unique ICs/system, saved
checkpoint replay of first ten steps for all six cases within 1e-6 CPU/GPU
difference, independently recomputed motion errors and scores. All 21 tests
pass. Browser checks cover every run, controls, phase modes, incomplete case,
and 1440/768/390/320px layouts without runtime errors or horizontal overflow.

### Research narrative refinement

Added the requested “But of course... data is king.” aside. Expanded the
polynomial-prior finding with Run 1 early normalized RMSE and retrospective
onset comparisons for Lorenz, Rössler and forced Van der Pol, checked against
the original saved metrics and public summaries. Explicitly distinguishes early
advantages from full-horizon point errors and scopes comparisons within each
system. Expanded breakdown explanation: variable values / first and second
derivatives, trailing five-sample quadratic estimator, training scaling, short
RMS windows, tolerance, 80% occupancy, validation-derived memory, confirmation,
recovery and the provisional development-calibrated multiplier. No new metrics
or fits were produced for these narrative edits. Built and checked desktop/phone
layout without overflow.
