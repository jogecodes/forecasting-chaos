# Playback methods and limitations

## Frozen research data

The forecast viewer reads the preserved `long-horizon-2026-11-05` results.
It does not train models or make live model calls. Source file hashes and the
research source commit are recorded in `data/manifest.json`. Research outputs
are ignored in the original checkout and must be backed up separately.

The website selects origins 0, 1, 3, 5, and 7: the reference plus the first
window of each of four test ICs. Selection is fixed without ranking scores.
The other overlapping origin per test IC is omitted from the viewer, not used
as another independent example. No new blind forecasting test has been run.

## Binary format

Assets are row-major little-endian IEEE-754 Float32. Every descriptor records
file name, shape, byte length, and SHA-256. Coordinates are converted from the
stored source arrays for display. Episode events remain unchanged in JSON. Summary errors are derived from the
original stored forecast arrays. No retraining, clipping, or trajectory decimation
is performed on forecast exports.

Truth and context arrays have shape `[samples, physical_dimensions]`. Forecast
rows concatenate `[mean state, member 1 state, ..., member k state, status]`.
There is one polynomial member and three neural members. Augmented forcing
channels are excluded from physical-state views. For VdP, known phase was used
by the original forecasters and advanced exactly.

Source row i is lead `(i+1)·dt`. The viewer prepends the last observed context
state at time zero to truth, mean, and members. Scrubbing and confirmation
markers use these physical lead times. Forecasts run without truth updates.

## Error and episode diagnostics

The comparison table after playback contains four forecasters for the selected
system and starting trajectory. Coordinate RMSE is sqrt(mean(error squared))
over the entire saved forecast. The full-state normalized score is the square
root of the average squared error after dividing each coordinate by its pooled
training standard deviation. Early scores use the first 180 forecast samples
(1.8 Lorenz units or 9 units for the other systems); full scores use all 50/200
saved time units. Observed context is excluded, and scores do not depend on the
playback position. The replay is fixed to the comparison window; full-horizon scores still use the complete saved forecast. The RMSE column lists all physical coordinates alongside the stacked coordinate plots.

The exporter derives these summaries from the original stored forecast arrays
using Float64 arithmetic, preserving every original trajectory and episode
array. It supports --forecasts-only to retain the gallery while refreshing scores.
An independent JS check reproduces all 60 summaries from compact display arrays
within Float32 precision. Highlighting denotes the model in the replay, not a
statistically established ranking.

“Simulation run” replaces the former “Starting trajectory” / “Initial condition” labels. It selects
a saved trajectory, observed context, and fixed forecast origin: reference
origin 0 or origins 1/3/5/7 from four test ICs. All models use the same observed
history and forecast start within an example.


The error chart is `sqrt(mean_j(((prediction_j-truth_j)/train_std_j)^2))` using
only physical-coordinate standard deviations pooled over training trajectories.
It is a pointwise state error, not the derivative-aware episode score.

The always-visible status strip is the original offline, retrospective ensemble-mean
episode label, with tracking / temporary-or-unconfirmed / sustained states.
Sustained onsets are backdated after future evidence confirms them. A passing
sample or episode recovery does not prove renewed global phase coherence.
An incomplete tail is censored in the original episode records. The viewer
preserves those records, including later recovery and confirmation times. The strip and onset/confirmation markers are revealed only up to the replay position; rewinding hides them again. Solid coral marks onset, dashed gray marks confirmation. Null events and events outside the displayed window create no marker. This reveal is a presentation choice, not a causal detector: onset labels still depend on later evidence.

The calibrated policy and tiny dependent development-label set are documented
in [current findings](CURRENT_FINDINGS.md). Model members are fitting-seed
variability, not calibrated probability intervals. Native system time units
are not a universal cross-system ranking scale.

## Lorenz sensitivity chapter

The live logarithmic slider chooses epsilon from 10^-8 to 10^-2 in 0.1-decade
increments. A module worker integrates starts (1,1,1) and (1+epsilon,1,1) with
Float64 RK4, internal step .0005, output spacing .01, duration 40. The reference
path is cached. Slider requests are debounced; stale responses cannot overwrite
the latest selection. Changing epsilon preserves the current display time.

Distances and coordinates remain Float64 throughout the live calculation. The
viewer shows the two trajectories and their logarithmic separation without an
arbitrary first-passage threshold, readout, or vertical threshold marker.
Finite step size and floating-point arithmetic affect the numerical results.

Short-window step-refinement tests show fourth-order convergence, and the
0..10 reference path agrees with the independent SciPy export within its
Float32 coordinate precision. These checks do not imply agreement at arbitrary
long times in a sensitive system. This is not a fitted asymptotic Lyapunov result
and is separate from every saved model forecast and episode diagnostic.

The original four high-tolerance SciPy RK45 pairs and distances remain in the
manifest for provenance/tests (rtol=1e-11, atol=1e-13). They are no longer used
for the continuous slider. Archived distances were computed before Float32
coordinate quantization.

The Lorenz chapter identifies A with a wider solid green stroke and ring marker,
and B with a thinner dashed orange stroke and diamond marker. The same line
styles appear in the x-time chart. When states overlap in screen space, the
wider green stroke remains visible beneath/between the orange dashes; nested
ring/diamond markers identify both states even at time zero. No coordinate
offset, jitter, altered initial difference, or artificial separation is applied.
The persistent legend explicitly explains the initial overlap.

## Physical exploration and archived atlas data

Continuous trajectories are integrated with the private project's existing
equations and explicit tolerances. The manifest records ICs and parameters.
Physical pendulum rods use their two angles; waterwheel buckets use actual
simulated masses (fill heights are relative within the displayed frame).
The waterwheel's discrete bucket dynamics are separate from a Lorenz reduction.

Pendulum and waterwheel have synchronized Physical / Phase space / Both modes
and a shared scrubber. Switching modes preserves simulation time and playback
state. The pendulum phase view is (theta_1, omega_1), a 2D projection of its 4D
state; angles are unwrapped. The bucket-wheel projection is (omega,S1,C1), where
S1=sum(m_j*sin(theta+2*pi*j/N)) and C1=sum(m_j*cos(theta+2*pi*j/N)). These moments
are computed from the same discrete bucket trajectory, not from reduced equations.
For readable mixed-unit geometry, each projected coordinate is centered and
divided by its own standard deviation across the displayed saved trajectory.
The view explicitly labels this display scaling. It does not change physical
motion, forecast scores, or episode policy. Both panels use the same sample
index; the phase trace shows up to 1,000 preceding samples without future ghosts.

The older map/circuit/oscillator exports remain archived in the manifest but
are no longer exposed by section 04. The current interface has only the two
physical mechanisms. Section 03 retains Lorenz, Rössler and forced Van der Pol.

Most charts render a subset of line vertices at screen resolution for speed,
but the complete exported samples remain available. This rendering is not
used for scientific scoring.

## Physical forecasting study (section 04)

Only the double pendulum and the 24-bucket waterwheel are shown in section 04.
Each has a physical-system explanation and animation before the forecasting
problem. The optional phase projection remains the same synchronized simulation.
Other gallery assets remain archived, without controls exposing them on the page.

New experiments are separate from section 03. Each uses 32 training initial
states, four validation states and three test states, drawn from distinct fixed
RNG streams (1701/1702/1703). The first test state is the pre-existing illustrative
mechanism initial state; the other two are fixed random examples, not selected
by score. All 39 initial states per system are unique. These are exploratory,
now-inspected examples within the same noiseless equations and parameters.

Truth uses DOP853 with rtol=1e-10, atol=1e-12, sampling 0.01 s (pendulum) or
0.02 s (wheel). Training runs last 24 s. Validation/test forecasts begin after
4 s (pendulum) or 12 s (wheel) of simulated warmup. Warmup is observed history,
not part of the scored forecast. Planned horizons are 25 s and 45 s respectively.

All four model families are fitted separately for each physical system on the
same fixed 32/4/3 trajectory split. The selector changes the saved predictions,
metrics and method description, while retaining the selected test run. All
forecasts begin at the original test origin after the same warmup.

- Residual MLP: the original fit and outputs are preserved. Two 128-unit SiLU
  hidden layers predict full-state increments from sine/cosine angles, velocities
  and every bucket mass. AdamW, seed 7, batch 256, 3,200 updates, four-step
  recursive normalized state loss; checkpoints every 400 updates are selected
  on separate 180-step validation forecasts.
- Transformer: two encoder layers, width 48, four attention heads, feed-forward
  width 96, no dropout and sinusoidal positions; reads the previous 24 states.
- GRU: two recurrent layers of 64 units; reads the same 24 observed states.
- Polynomial dynamics: quadratic polynomials of standardized sine/cosine angle
  features, velocities and bucket masses, fitted by least squares with rcond
  1e-8 to fourth-order central finite-difference derivative targets. Learned
  derivatives are integrated with RK4, four substeps per exported sample. The
  degree is fixed at two before test evaluation; physical equation coefficients
  are never supplied. Unlike section 03's polynomial equations, these physical
  equations contain trigonometric, rational and exponential terms, so the
  quadratic feature library is an approximation.

The new Transformer and GRU fits use the same seed, optimizer, batch size,
3,200 updates, four-step recursive loss and 180-step validation checkpoint
selection as the physical MLP. Scaling is estimated from training data only.
Full observed contexts are reconstructed from the original initial states and
solver settings, ending exactly at the unchanged validation/test origins; the
script verifies their future truth matches the original arrays. The MLP and
polynomial models consume only the last context state. No model sees future
truth after that origin, and histories contain only predictions during rollout.
These are the same model families as section 03, adapted to periodic angles;
physical experiments use one neural seed rather than section 03's three.
One seed gives no calibrated uncertainty. Test trajectories are inspected
exploratory examples, not a fresh blind benchmark.

Shown motion errors are Euclidean separation of the lower bobs (unit rod length)
or absolute wheel angular-velocity difference (rad/s). RMSE summaries use the
first 1.8 s and the whole completed forecast, excluding the observed start.
The physical panels share the same timeline; wheel bucket fills share a common
scale across simulation and forecast. Full-state normalized errors are exported
with angle differences wrapped to [-π,π], but are distinct from motion scores.

The original second MLP pendulum forecast becomes unstable. Other model
rollouts are checked independently using the same training-derived guard. Its full original output remains
in artifacts, but display stops before an angular velocity exceeds 10 times
the largest training speed. Nonfinite states or negative wheel masses would
also stop display. This numerical display guard is not a forecast-accuracy or
chaos threshold. The UI marks an invalid run incomplete and omits its full-horizon score. If a
rollout stops before 1.8 seconds, its early score is also unavailable rather
than being computed over a shortened interval.
The old episode policy is not transferred to these physical experiments.

Independent checks compare both RHS implementations with the original research
equations at 100 states each, audit initial-state disjointness, replay ten steps
from each saved checkpoint on every test run (CPU/GPU differences <1e-6), and
recompute every displayed motion error and score from exported arrays.
