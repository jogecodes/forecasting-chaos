import { C, chart, pendulum, waterwheel } from './draw.js';
import { column } from './math.js';

// Saved free forecasts only: no fitting, truth corrections or perturbed ODEs here.
export function createPhysicalForecast({ loadArray, onError }) {
  const $ = id => document.getElementById(id);
  const state = { index: 0, playing: false, dirty: true, sequence: 0, data: null };
  function button() {
    $('physical-forecast-play').textContent = state.playing ? 'Pause forecast' : 'Play forecast';
    $('physical-forecast-play').setAttribute('aria-pressed', String(state.playing));
  }
  function reset() { state.index = 0;state.playing = false;state.dirty = true;button(); }
  $('physical-forecast-play').addEventListener('click', () => {
    if (!state.data) return;
    if (state.index >= state.data.samples - 1) state.index = 0;
    state.playing = !state.playing;state.dirty = true;button();
  });
  $('physical-forecast-reset').addEventListener('click', reset);
  $('physical-forecast-scrub').addEventListener('input', e => {
    if (!state.data) return;
    state.index = Number(e.target.value) / 1000 * (state.data.samples - 1);state.dirty = true;
  });
  $('physical-forecast-run').addEventListener('change', () => load(state.slug, state.config).catch(onError));
  const observer = new ResizeObserver(() => { state.dirty = true; });
  ['physical-truth','physical-prediction','physical-motion-series','physical-motion-error'].forEach(id => observer.observe($(id)));

  async function load(slug, config) {
    const version = ++state.sequence;
    const changed = state.slug !== slug;
    state.slug = slug;state.config = config;state.data = null;reset();
    $('physical-forecast-play').disabled = true;
    if (!config) throw new Error(`Saved physical forecast missing for ${slug}`);
    if (changed) $('physical-forecast-run').replaceChildren(...config.runs.map((_, i) => {
      const option = document.createElement('option');option.value = i;option.textContent = `Run ${i + 1}`;return option;
    }));
    const run = config.runs[Number($('physical-forecast-run').value)];
    const [truth, prediction, mismatch] = await Promise.all([loadArray(run.truth), loadArray(run.prediction), loadArray(run.mismatch)]);
    if (version !== state.sequence) return;
    const d = config.dimensions, samples = run.truth.shape[0];
    const tipX = values => Float64Array.from({ length: samples }, (_, i) => Math.sin(values[i*d])+Math.sin(values[i*d+1]));
    const truthLine = slug === 'pendulum' ? tipX(truth) : column(truth, d, 1);
    const predictionLine = slug === 'pendulum' ? tipX(prediction) : column(prediction, d, 1);
    let massScale = 0;
    if (slug === 'waterwheel') for (const values of [truth,prediction]) for (let i = 0;i < samples;i++) for (let j = 2;j < d;j++) massScale = Math.max(massScale, values[i*d+j]);
    state.data = { truth, prediction, mismatch, truthLine, predictionLine, samples, massScale };
    const pend = slug === 'pendulum';
    $('physical-forecast-title').textContent = pend ? 'Can a model keep up with the pendulum?' : 'Can a model predict the next turn?';
    $('physical-forecast-description').textContent = pend
      ? 'Here, the simulation models two masses connected by rigid arms, moving under gravity. The equations come from the forces and constraints of that mechanical setup; chaotic motion can emerge from their interaction. Lorenz reduced convection to three variables. This time, we’re asking the model to predict the angles and angular velocities of a mechanism we can watch moving. Both animations start from the same state: one follows the physical model, while the neural network keeps going using its own predictions. Watch the lower bobs as their timing begins to slip.'
      : 'This time, the model sees the wheel’s angle, its rotation speed and the water in every bucket. It has to predict all of them together: getting the water distribution wrong changes the next turn. The lime-colored wheel runs entirely on the model’s predictions, with no corrections from the simulation.';
    $('physical-series-title').textContent = pend ? 'LOWER BOB / HORIZONTAL POSITION' : 'WHEEL / ANGULAR VELOCITY';
    $('physical-error-title').textContent = pend ? 'DISTANCE BETWEEN THE LOWER BOBS / ROD LENGTHS' : 'DIFFERENCE IN ROTATION SPEED / RADIANS PER SECOND';
    $('physical-motion-series').setAttribute('aria-label', pend ? 'Horizontal position of the lower bob: simulation and forecast' : 'Wheel angular velocity: simulation and forecast');
    $('physical-motion-error').setAttribute('aria-label', pend ? 'Distance between simulated and forecast lower bobs' : 'Absolute angular velocity error');
    const fmt = value => value === null ? 'Not completed' : value === 0 ? '0' : value.toPrecision(3);
    $('physical-forecast-failure').hidden = !run.failure;
    $('physical-forecast-failure').textContent = run.failure ? `This model rollout becomes unstable at ${run.failure.time.toFixed(2)} seconds. Playback stops before that state; the full-forecast score is unavailable.` : '';
    $('physical-score-label').textContent = pend ? 'Lower bob position error' : 'Wheel rotation-speed error';
    $('physical-score-early').textContent = `${fmt(run.scores.earlyMotionRmse)} ${pend ? 'rod lengths' : 'rad/s'}`;
    $('physical-score-full').textContent = run.failure ? 'Not completed' : `${fmt(run.scores.motionRmse)} ${pend ? 'rod lengths' : 'rad/s'}`;
    $('physical-score-duration').textContent = `Full ${config.duration}-second forecast`;
    $('physical-method').textContent = `A separate residual MLP was fitted for this system using 32 simulated training runs. Four other runs selected the checkpoint using 180-step forecasts; these three displayed runs were excluded from fitting and checkpoint selection. Inputs include the full simulated state, with angles encoded as sine and cosine. The network has two hidden layers of 128 units, uses a four-step recursive training loss and one fitting seed (7). After the starting state, every step uses the previous prediction. This is a new, exploratory noiseless simulation experiment, not a forecast of a measured physical apparatus.`;
    $('physical-score-note').textContent = `RMSE measures the typical ${pend ? 'distance between the lower bobs' : 'rotation-speed error'} over the first 1.8 seconds or all ${config.duration} seconds. The observed starting state is excluded. These motion scores differ from the full-state normalized errors in section 03.`;
    $('physical-forecast-play').disabled = false;state.dirty = true;
  }
  function draw() {
    const data = state.data;if (!data) return;
    const index = Math.floor(state.index), config = state.config;
    if (state.slug === 'pendulum') {
      pendulum($('physical-truth'), data.truth, index, 150, { color: C.white });
      pendulum($('physical-prediction'), data.prediction, index, 150, { color: C.lime });
    } else {
      const options = { massScale: data.massScale };
      waterwheel($('physical-truth'), data.truth, index, 24, { ...options, color: C.white });
      waterwheel($('physical-prediction'), data.prediction, index, 24, { ...options, color: C.lime });
    }
    const options = { dt: config.dt, xMax: config.duration, index };
    chart($('physical-motion-series'), [{ values: data.truthLine, color: C.white },{ values: data.predictionLine, color: C.lime }], options);
    chart($('physical-motion-error'), [{ values: data.mismatch, color: C.coral }], { ...options, yMin: 0 });
    $('physical-forecast-time').value = `${(index * config.dt).toFixed(2)} s`;
    $('physical-forecast-scrub').value = String(Math.round(state.index / (data.samples - 1) * 1000));state.dirty = false;
  }
  function tick(delta) {
    if (!state.data) return;
    const rect = $('physical-forecast-player').getBoundingClientRect();
    if (rect.bottom < -200 || rect.top > innerHeight + 200) return;
    if (state.playing) {
      state.index = Math.min(state.data.samples - 1, state.index + delta / state.config.dt * Number($('physical-forecast-speed').value));state.dirty = true;
      if (state.index >= state.data.samples - 1) { state.playing = false;button(); }
    }
    if (state.dirty) draw();
  }
  return { load, tick, reset };
}
