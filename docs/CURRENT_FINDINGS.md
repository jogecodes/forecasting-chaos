# Current scientific account

Prepared 2026-11-05 from the preserved chaos research handover and saved runs.
The primary current source snapshot is commit
`c7b98bc5b381f0bf21b45622a3f6ada0d34aee41`.

## Supported findings

1. **Deterministic toy models produce intricate, sensitive motion.** The collection
   contains discrete maps, continuous flows, and physical interpretations.
   Parameter choices and numerical settings determine the regime. Neither an
   appealing attractor picture nor a positive finite-time estimate proves
   asymptotic chaos or validates a real device.
2. **More simulated data helped the Transformer in the controlled VdP study.**
   Fresh-test position RMSE for 1/8/32 training trajectories was
   1.06856 / 0.44486 / 0.39344. Architecture and optimizer update count were held
   fixed. Epochs per sample were not held fixed. The larger pool covers the same
   equations and parameters; it does not test a changed physical system.
3. **A compatible dynamics prior is powerful.** Learned polynomial derivatives
   are a strong comparator for these low-order toy equations. Their results do
   not establish superiority over neural models on arbitrary real data.
4. **Reconstruction and extrapolation are different tasks.** In the corrected
   reference PINN, held-out in-window position RMSE was 0.00119 while position
   extrapolation RMSE over t=20..25 was 2.90639. Each IC used its own fitted PINN.
   Architecture, observation budget, and training duration changed relative to
   older PINN experiments; this is not a controlled attribution of one fix.
5. **Trajectory accuracy and long-run geometry are distinct.** Some neural Lorenz
   members retain broad butterfly geometry after pointwise divergence. Geometry,
   marginal distributions, and autocorrelation are useful but insufficient to
   establish correct chaotic dynamics. An ensemble mean may obscure individual
   members' motion.
6. **Breakdown can be transient and recoverable.** A first threshold breach is
   insufficient to describe the inspected VdP example. The current episode
   heuristic checks value, slope, and curvature, then confirms sustained joint
   disagreement and permits recovery. It is development-calibrated, retrospective,
   and not a live confidence indicator or universal coherence horizon.

## Current comparison

Active forecasters: Polynomial dynamics, Transformer, GRU, residual MLP.
Persistence and Ridge were removed from active long-horizon comparisons at the
owner's request. They remain historical only. The PINN is a separate task.

Systems: forced Van der Pol, autonomous Lorenz, autonomous Rössler. There are
32 training trajectories, four validation ICs, four test ICs, and a separate
reference IC per system. The nine original origins include overlapping pairs
and are dependent. Three neural fitting seeds do not give three independent
data-generating experiments. Full state is observed; VdP forcing phase is known.

## Diagnostic status

Validation-derived memory τ gives confirmation window 5τ, bad occupancy 80%, and
allowed passing gaps τ. The multiplier 5 was calibrated on four forecasters of
one VdP reference trajectory; repeated x/v labels are not independent examples.
Withholding GRU selects multiplier 3 and flags its earlier episode near 2.4.
There are no human visual labels for Lorenz or Rössler. Exported episode colors
apply the existing rule; this website does not independently validate it.

Reference VdP onsets are 11.10 / 10.80 / 10.95 / 11.05 for polynomial /
Transformer / GRU / MLP. Confirmation is later (14.80 / 14.50 / 14.65 / 14.75).
These are example-specific measurements, not universal model capabilities.

## Documentation reconciliation

- Old single-trajectory temporal-split experiments are historical. They are not
  the later held-out-IC study and their metrics are not interchangeable.
- Early coherence definitions and forcing-cycle policies were superseded. Use
  the current validation-memory episode policy for the optional website strip.
- The waterwheel's older local README says there is no demonstrated chaotic
  regime. Current defaults produce reversals and reported positive finite-time
  sensitivity. The old inflow scan's mean/std curves are not a bifurcation
  diagram or proof that no regime transition exists. Describe the evidence and
  its finite numerical scope rather than making either categorical claim.
- Earlier VdP finite-time exponent estimates (~0.12–0.14) and later conditional
  estimates (~0.17–0.18) used different intervals/settings; they are not exact
  constants. The website deliberately avoids a headline exponent.

## Next scientific work

Review autonomous-system plots, preserve visual judgments separately, freeze a
candidate diagnostic, then evaluate genuinely new ICs. Test noise, partial
observations, and parameter changes only through explicitly defined experiments.
Do not tune repeatedly inspected tests to make the display look better.
