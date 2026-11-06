import { boundsOf, column, decodeFloat32, extractState, prependState, trainingScaledError } from './math.js';
import { C, chart, orbit, pendulum, scene, surface, waterwheel } from './draw.js';
import { models } from './models.js';
import { pendulumPhase, standardizeProjection, waterwheelPhase } from './dynamics.js';
import { loadManifest } from './load.js';
import { revealedDiagnosticMarkers } from './forecast-view.js';
import { createPhysicalForecast } from './physical-forecast.js';

const $ = id => document.getElementById(id);
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const reducedMotion = motionPreference.matches;
const assetCache = new Map();
let manifest;
let sensitivityWorker;
let sliderTimer;
const sensitivityJobs = new Map();

function computeSensitivity(id, epsilon) {
  if (!sensitivityWorker) {
    sensitivityWorker = new Worker(new URL('./sensitivity-worker.js', import.meta.url), { type: 'module' });
    sensitivityWorker.onmessage = ({ data }) => {
      const job = sensitivityJobs.get(data.id);
      if (!job) return;
      sensitivityJobs.delete(data.id);
      data.error ? job.reject(new Error(data.error)) : job.resolve(data);
    };
    sensitivityWorker.onerror = () => {
      for (const job of sensitivityJobs.values()) job.reject(new Error('The sensitivity worker could not run.'));
      sensitivityJobs.clear();sensitivityWorker.terminate();sensitivityWorker = null;
    };
  }
  return new Promise((resolve, reject) => {
    sensitivityJobs.set(id, { resolve, reject });sensitivityWorker.postMessage({ id, epsilon });
  });
}

function report(error) {
  console.error(error);
  $('load-error').textContent = `An experiment could not load: ${error.message}. Reload to retry. For local use, serve this folder over HTTP rather than opening index.html as a file.`;
  $('load-error').hidden = false;
}
async function loadArray(descriptor) {
  if (!assetCache.has(descriptor.file)) {
    const promise = fetch(new URL(`../data/${descriptor.file}`, import.meta.url)).then(async response => {
      if (!response.ok) throw new Error(`${descriptor.file}: HTTP ${response.status}`);
      return decodeFloat32(await response.arrayBuffer(), descriptor);
    }).catch(error => { assetCache.delete(descriptor.file);throw error; });
    assetCache.set(descriptor.file, promise);
  }
  return assetCache.get(descriptor.file);
}
function run(task) { Promise.resolve().then(task).catch(report); }
function buttonState(id, playing) { $(id).textContent = `${playing ? 'Pause' : 'Play'}${id === 'gallery-play' ? ' animation' : ''}`;$(id).setAttribute('aria-pressed', String(playing)); }
function option(value, text) { const o = document.createElement('option');o.value = value;o.textContent = text;return o; }
function trajectoryLabel(origin) { return `Run ${origin.index === 0 ? 1 : (origin.index + 1) / 2 + 1}`; }
function visible(element) {
  const rect = element.getBoundingClientRect();
  const margin = 200;
  return rect.bottom > -margin && rect.top < window.innerHeight + margin && rect.width > 0 && rect.height > 0;
}

const hero = { data: null, index: 1500, dirty: true };
const sensitivity = { data: null, index: 0, playing: false, dirty: true, sequence: 0, persistence: 15 };
const forecast = { data: null, index: 0, playing: false, dirty: true, sequence: 0 };
const gallery = { data: null, index: 0, playing: !reducedMotion, dirty: true, slug: 'pendulum', sequence: 0, view: 'physical' };
const physicalForecast = createPhysicalForecast({ loadArray, onError: report });
motionPreference.addEventListener('change', () => { hero.dirty = true; });
const sensitivityOrbit = orbit($('sensitivity-canvas'), () => { sensitivity.dirty = true; });
const forecastOrbit = orbit($('forecast-canvas'), () => { forecast.dirty = true; });
const galleryPhaseOrbit = orbit($('gallery-phase-canvas'), () => { gallery.dirty = true; });


async function loadSensitivity() {
  const version = ++sensitivity.sequence;
  sensitivity.resumeAfterCompute ||= sensitivity.playing;
  sensitivity.playing = false;buttonState('sensitivity-play', false);
  $('sensitivity-play').disabled = true;
  $('sensitivity').setAttribute('aria-busy', 'true');
  const epsilon = 10 ** Number($('epsilon').value);
  $('epsilon-value').value = epsilon.toExponential(1);
  $('epsilon').setAttribute('aria-valuetext', `Initial x difference ${epsilon.toExponential(1)}`);
  const { data, separation } = await computeSensitivity(version, epsilon);
  if (version !== sensitivity.sequence) return;
  sensitivity.data = data;
  sensitivity.a = column(data, 6, 0);sensitivity.b = column(data, 6, 3);
  sensitivity.error = separation;
  sensitivity.bounds = boundsOf([{ data, width: 6 }, { data, width: 6, offset: 3 }]);
  sensitivity.dirty = true;
  $('sensitivity').setAttribute('aria-busy', 'false');
  sensitivity.playing = Boolean(sensitivity.resumeAfterCompute);
  sensitivity.resumeAfterCompute = false;buttonState('sensitivity-play', sensitivity.playing);
  $('sensitivity-play').disabled = false;
}
function drawSensitivity() {
  if (!sensitivity.data) return;
  const index = Math.floor(sensitivity.index);
  scene($('sensitivity-canvas'), [
    { data: sensitivity.data, width: 6, color: C.lime, lineWidth: 3.2, marker: 'ring' },
    { data: sensitivity.data, width: 6, offset: 3, color: C.coral, lineWidth: 1.6, dash: [8, 6], marker: 'diamond' },
  ], { ...sensitivityOrbit, bounds: sensitivity.bounds, index, trail: Math.floor(sensitivity.persistence / .01) });
  chart($('sensitivity-series'), [{ values: sensitivity.a, color: C.lime, lineWidth: 3 }, { values: sensitivity.b, color: C.coral, lineWidth: 1.5, dash: [6, 5] }], { dt: .01, xMax: 40, index });
  chart($('sensitivity-error'), [{ values: sensitivity.error, color: C.cyan }], { dt: .01, xMax: 40, index, log: true });
  $('sensitivity-time').value = (index * .01).toFixed(2);
  $('separation-value').value = sensitivity.error[index].toExponential(2);
  $('sensitivity-scrub').value = String(index);
  sensitivity.dirty = false;
}

function configureSystem() {
  const config = manifest.systems[$('forecast-system').value];
  $('forecast-origin').replaceChildren(...config.origins.map((o, i) => option(i, trajectoryLabel(o))));
  $('forecast-projection').textContent = config.dimensions === 3 ? 'State space / x, y, z · Drag to rotate' : 'Physical-state projection / x, v · forcing phase not shown';
  forecastOrbit.yaw = config.dimensions === 2 ? 0 : -.55;
  forecastOrbit.pitch = config.dimensions === 2 ? -Math.PI / 2 : .35;
  return loadForecast();
}
async function loadForecast() {
  const version = ++forecast.sequence;
  forecast.playing = false;buttonState('forecast-play', false);$('forecast-play').disabled = true;
  const config = manifest.systems[$('forecast-system').value];
  const origin = config.origins[Number($('forecast-origin').value)];
  const selected = origin.models[$('forecast-model').value];
  const [rawTruth, rows, context] = await Promise.all([loadArray(origin.truth), loadArray(selected.values), loadArray(origin.context)]);
  if (version !== forecast.sequence) return;
  const d = config.dimensions, rowWidth = selected.values.shape[1];
  const lastState = context.slice(context.length - d);
  const truth = prependState(rawTruth, lastState);
  const mean = prependState(extractState(rows, rowWidth, d), lastState);
  const members = Array.from({ length: selected.memberCount }, (_, i) => prependState(extractState(rows, rowWidth, d, (i + 1) * d), lastState));
  forecast.data = { config, origin, selected, truth, mean, members, rows, rowWidth, d };
  forecast.index = 0;forecast.dirty = true;
  forecast.data.bounds = boundsOf([{ data: truth, width: d, dimensions: d }, { data: mean, width: d, dimensions: d }, ...members.map(data => ({ data, width: d, dimensions: d }))]);
  const scales = config.trainingScales;
  if (!scales) throw new Error('Training scales missing from forecast export');
  forecast.data.error = trainingScaledError(truth, mean, d, scales);
  const toggle = $('show-members'), hasMembers = members.length > 1;
  toggle.disabled = !hasMembers;
  toggle.querySelector('span').textContent = hasMembers ? `${toggle.getAttribute('aria-pressed') === 'true' ? 'Hide' : 'Show'} individual trajectories` : 'Single fitted trajectory';
  configureCoordinatePlots();
  $('forecast-example-help').textContent = `Each run uses the same equations but starts from a different state. Switching runs gives the models a different example to predict; it does not retrain them. All four forecasters use the same observed history within a run.`;
  $('forecast-note').textContent = `${trajectoryLabel(origin)} · ${config.samples.toLocaleString()} forecast samples · ${selected.memberCount === 1 ? 'Single polynomial fit' : 'Neural seeds 7 / 11 / 23'} · No truth updates · ${config.horizon} native time units saved`;
  $('forecast-play').disabled = false;
}
function configureCoordinatePlots() {
  const f = forecast.data;
  f.coordinateLines = f.config.labels.map((label, j) => {
    const wrapper = document.createElement('div');wrapper.className = 'coordinate-plot';
    const heading = document.createElement('div');heading.className = 'chart-heading';heading.textContent = `${label} / TIME`;
    const canvas = document.createElement('canvas');canvas.id = `forecast-series-${j}`;
    canvas.setAttribute('aria-label', `${label} over time: truth, forecast mean and individual seed trajectories`);
    wrapper.append(heading, canvas);return { wrapper, canvas, truth: column(f.truth, f.d, j), mean: column(f.mean, f.d, j), members: f.members.map(member => column(member, f.d, j)) };
  });
  $('forecast-coordinates').replaceChildren(...f.coordinateLines.map(line => line.wrapper));
  renderForecastScores();forecast.dirty = true;
}
function renderForecastScores() {
  const f = forecast.data;
  if (!f) return;
  const system = $('forecast-system').selectedOptions[0].textContent;
  $('forecast-score-context').textContent = `${system} · ${trajectoryLabel(f.origin)} · ${f.config.samples.toLocaleString()} saved forecast steps. Compare the same starting example across all four models.`;
  $('forecast-score-caption').textContent = `Prediction errors for ${system}, ${trajectoryLabel(f.origin).toLowerCase()}. Lower is better.`;
  const models = Object.entries(f.origin.models);
  if (models.some(([, model]) => !model.scores)) {
    $('forecast-score-context').textContent = 'Summary scores are not available in this export.';
    $('forecast-score-body').replaceChildren();return;
  }
  const early = models[0][1].scores;
  $('score-short-heading').textContent = `Early NRMSE · ${early.shortTime} units`;
  $('score-full-heading').textContent = `Full NRMSE · ${f.config.horizon} units`;
  $('score-rmse-heading').textContent = 'Full RMSE / coordinate';
  const format = value => value === 0 ? '0' : Math.abs(value) < .001 || Math.abs(value) >= 10000 ? value.toExponential(2) : value.toPrecision(3);
  const rows = models.map(([slug, model]) => {
    const row = document.createElement('tr');row.dataset.model = slug;
    row.dataset.selected = String(slug === $('forecast-model').value);
    const name = document.createElement('th');name.scope = 'row';name.textContent = model.label;row.append(name);
    for (const value of [model.scores.shortNormalizedRmse, model.scores.fullNormalizedRmse]) {
      const cell = document.createElement('td');cell.textContent = format(value);row.append(cell);
    }
    const coordinates = document.createElement('td');coordinates.className = 'coordinate-scores';
    f.config.labels.forEach((label, j) => {
      const score = document.createElement('span');score.textContent = `${label}: ${format(model.scores.rmseByState[j])}`;coordinates.append(score);
    });
    row.append(coordinates);return row;
  });
  $('forecast-score-body').replaceChildren(...rows);
}
function forecastLimit() {
  if (!forecast.data) return 1;
  const c = forecast.data.config;
  return Math.min(c.samples, Math.round(c.displayHorizon / c.dt));
}
function drawForecast() {
  if (!forecast.data) return;
  const f = forecast.data, index = Math.min(Math.floor(forecast.index), forecastLimit());
  const showMembers = $('show-members').getAttribute('aria-pressed') === 'true' && f.members.length > 1;
  const stateSeries = [{ data: f.truth, width: f.d, dimensions: f.d, color: C.white, alpha: .7 }];
  if (showMembers) for (const member of f.members) stateSeries.push({ data: member, width: f.d, dimensions: f.d, color: C.cyan, alpha: .23, lineWidth: .8 });
  stateSeries.push({ data: f.mean, width: f.d, dimensions: f.d, color: C.lime });
  const orientation = f.d === 2 ? { yaw: 0, pitch: -Math.PI / 2 } : forecastOrbit;
  scene($('forecast-canvas'), stateSeries, { ...orientation, bounds: f.bounds, index, trail: f.config.dimensions === 2 ? 1000 : 2200 });
  const limit = forecastLimit();
  const opts = { dt: f.config.dt, xMax: limit * f.config.dt, samples: limit + 1, index };
  opts.markers = revealedDiagnosticMarkers(f.selected, index * f.config.dt, limit * f.config.dt);
  for (const line of f.coordinateLines) {
    const lines = [{ values: line.truth, color: C.white, alpha: .8 }];
    if (showMembers) for (const values of line.members) lines.push({ values, color: C.cyan, alpha: .3, lineWidth: .8 });
    lines.push({ values: line.mean, color: C.lime });
    // Hidden members still contribute to the axis range, so toggling never rescales.
    const scaleLines = [line.truth, line.mean, ...line.members].map(values => ({ values }));
    chart(line.canvas, lines, { ...opts, scaleLines });
  }
  chart($('forecast-error'), [{ values: f.error, color: C.coral }], { ...opts, yMin: 0 });
  $('forecast-time').value = (index * f.config.dt).toFixed(2);
  $('forecast-scrub').value = String(Math.round(index / limit * 1000));
  drawDiagnostic(index, limit);
  forecast.dirty = false;
}
function drawDiagnostic(index, limit) {
  const f = forecast.data;
  const { ctx, width, height } = surface($('diagnostic-strip'));
  const colors = ['#71ab8a', '#d9b778', '#c67a70'];
  // Reveal the retrospective labels only up to the current replay position.
  for (let i = 0; i < index; i++) {
    const status = f.rows[i * f.rowWidth + f.rowWidth - 1];
    ctx.fillStyle = colors[status];ctx.fillRect(i / limit * width, 6, width / limit + .5, height - 12);
  }
  ctx.fillStyle = C.white;ctx.fillRect(index / limit * width, 0, 1, height);
  const status = index === 0 ? 0 : f.rows[(index - 1) * f.rowWidth + f.rowWidth - 1];
  $('diagnostic-label').textContent = ['Tracking (local checks)', 'Temporary / unconfirmed mismatch', 'Sustained episode'][status];
  $('diagnostic-label').dataset.status = ['tracking', 'temporary', 'sustained'][status];
  const now = index * f.config.dt;
  const timing = (value, label) => Number.isFinite(value) && value <= now ? `${label}: ${value.toFixed(2)}` : null;
  const times = [timing(f.selected.onset, 'Mismatch onset'), timing(f.selected.confirmation, 'Confirmed at')].filter(Boolean);
  $('diagnostic-times').textContent = times.length ? times.join(' · ') : 'No sustained mismatch onset reached at this playback position.';

}

async function selectGallery(slug) {
  if (!models[slug]) return;
  const version = ++gallery.sequence;
  gallery.slug = slug;gallery.index = 0;gallery.data = null;
  document.querySelectorAll('button[data-model]').forEach(button => {
    button.classList.toggle('selected', button.dataset.model === slug);
    button.setAttribute('aria-pressed', String(button.dataset.model === slug));
  });
  const copy = models[slug];
  $('gallery-name').textContent = copy.name;$('gallery-type').textContent = copy.type;
  $('gallery-description').textContent = copy.description;$('gallery-insight').textContent = copy.insight;
  $('gallery-insight').hidden = !copy.insight;
  $('gallery-equation').textContent = copy.equation;
  const config = manifest.gallery[slug];
  const data = await loadArray(config.states);
  if (version !== gallery.sequence) return;
  gallery.data = data;gallery.config = config;
  gallery.phaseDimensions = slug === 'pendulum' ? 2 : 3;
  const phase = slug === 'pendulum' ? pendulumPhase(data) : waterwheelPhase(data, config.bucketCount);
  gallery.phase = standardizeProjection(phase, gallery.phaseDimensions);
  gallery.phaseBounds = boundsOf([{ data: gallery.phase, width: gallery.phaseDimensions, dimensions: gallery.phaseDimensions }]);
  $('phase-label').textContent = slug === 'pendulum' ? 'PROJECTION / θ₁, ω₁' : 'PROJECTION / ω, S₁, C₁';
  $('gallery-views').dataset.view = gallery.view;
  $('gallery-physical-pane').hidden = gallery.view === 'phase';$('gallery-phase-pane').hidden = gallery.view === 'physical';
  $('gallery-caption').textContent = gallery.view === 'physical' ? copy.caption : 'Same simulated state · phase coordinates scaled by their own sample std';

  gallery.dirty = true;
  await physicalForecast.load(slug, manifest.physicalForecasts[slug]);
}
function galleryLimit() { return (gallery.config?.states.shape[0] || 2) - 1; }
function drawGallery() {
  if (!gallery.data) return;
  const index = Math.floor(gallery.index), slug = gallery.slug;
  if (slug === 'pendulum') pendulum($('gallery-canvas'), gallery.data, index);
  else waterwheel($('gallery-canvas'), gallery.data, index, gallery.config.bucketCount);
  $('gallery-time').value = `t = ${(index * gallery.config.dt).toFixed(2)} s`;
  if (gallery.view !== 'physical') {
    const d = gallery.phaseDimensions;
    scene($('gallery-phase-canvas'), [{ data: gallery.phase, width: d, dimensions: d, color: C.cyan }], {
      ...(d === 2 ? { yaw: 0, pitch: -Math.PI / 2 } : galleryPhaseOrbit), bounds: gallery.phaseBounds,
      index, trail: 1000, labels: d === 2 ? ['θ₁ / std', 'ω₁ / std'] : ['ω / std', 'S₁ / std', 'C₁ / std'],
    });
  }
  $('gallery-scrub').value = String(Math.round(gallery.index / galleryLimit() * 1000));gallery.dirty = false;
}

function reset(state, button) { state.index = 0;state.playing = false;state.resumeAfterCompute = false;state.dirty = true;buttonState(button, false); }
$('epsilon').addEventListener('input', () => {
  $('epsilon-value').value = (10 ** Number($('epsilon').value)).toExponential(1);
  clearTimeout(sliderTimer);sliderTimer = setTimeout(() => run(loadSensitivity), 70);
});
$('sensitivity-persistence').addEventListener('input', e => {
  const position = Number(e.target.value);
  // Zero and infinity are explicit endpoints, outside the finite logarithmic range.
  sensitivity.persistence = position === 0 ? Infinity : position === 1000 ? 0 : 100 * (.01 / 100) ** ((position - 1) / 998);
  const label = Number.isFinite(sensitivity.persistence) ? `${Number(sensitivity.persistence.toPrecision(3))} s` : '∞ s';
  $('persistence-value').value = label;
  e.target.setAttribute('aria-valuetext', position === 0 ? 'Infinite; keep the full trail' : `${label} of simulation time${position === 1000 ? '; current positions only' : ''}`);
  sensitivity.dirty = true;
});
$('sensitivity-play').addEventListener('click', () => { if (sensitivity.index >= 4000) sensitivity.index = 0;sensitivity.playing = !sensitivity.playing;buttonState('sensitivity-play', sensitivity.playing); });
$('sensitivity-reset').addEventListener('click', () => reset(sensitivity, 'sensitivity-play'));
$('sensitivity-scrub').addEventListener('input', e => { sensitivity.index = Number(e.target.value);sensitivity.dirty = true; });
$('forecast-system').addEventListener('change', () => run(configureSystem));
for (const id of ['forecast-model', 'forecast-origin']) $(id).addEventListener('change', () => run(loadForecast));
$('forecast-play').addEventListener('click', () => { if (forecast.index >= forecastLimit()) forecast.index = 0;forecast.playing = !forecast.playing;buttonState('forecast-play', forecast.playing); });
$('forecast-reset').addEventListener('click', () => reset(forecast, 'forecast-play'));
$('forecast-scrub').addEventListener('input', e => { forecast.index = Number(e.target.value) / 1000 * forecastLimit();forecast.dirty = true; });
$('show-members').addEventListener('click', () => {
  const button = $('show-members'), visible = button.getAttribute('aria-pressed') !== 'true';
  button.setAttribute('aria-pressed', String(visible));
  button.querySelector('span').textContent = `${visible ? 'Hide' : 'Show'} individual trajectories`;
  forecast.dirty = true;
});
document.querySelectorAll('button[data-model]').forEach(button => button.addEventListener('click', () => run(() => selectGallery(button.dataset.model))));
$('gallery-play').addEventListener('click', () => { gallery.playing = !gallery.playing;buttonState('gallery-play', gallery.playing); });
$('gallery-reset').addEventListener('click', () => reset(gallery, 'gallery-play'));
$('gallery-scrub').addEventListener('input', () => { gallery.index = Number($('gallery-scrub').value) / 1000 * galleryLimit();gallery.dirty = true; });
document.querySelectorAll('[data-gallery-view]').forEach(button => button.addEventListener('click', () => {
  gallery.view = button.dataset.galleryView;
  $('gallery-views').dataset.view = gallery.view;
  $('gallery-physical-pane').hidden = gallery.view === 'phase';
  $('gallery-phase-pane').hidden = gallery.view === 'physical';
  $('gallery-caption').textContent = gallery.view === 'physical' ? models[gallery.slug].caption : 'Same simulated state · phase coordinates scaled by their own sample std';
  document.querySelectorAll('[data-gallery-view]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  gallery.dirty = true;
}));

const resizeObserver = new ResizeObserver(() => { for (const state of [hero, sensitivity, forecast, gallery]) state.dirty = true; });
document.querySelectorAll('canvas').forEach(canvas => resizeObserver.observe(canvas));
document.addEventListener('visibilitychange', () => { lastFrame = 0; });
let lastFrame = 0, lastPaint = 0;
function animate(now) {
  requestAnimationFrame(animate);
  const delta = lastFrame ? Math.min((now - lastFrame) / 1000, .06) : 0;lastFrame = now;
  if (document.hidden || now - lastPaint < 32) return;
  const frameDelta = lastPaint ? Math.min((now - lastPaint) / 1000, .1) : delta;lastPaint = now;
  if (hero.data && visible($('hero-canvas'))) {
    hero.index = (hero.index + frameDelta * (motionPreference.matches ? 30 : 120)) % (hero.data.length / 3);hero.dirty = true;
    if (hero.dirty) { scene($('hero-canvas'), [{ data: hero.data, width: 3, color: C.lime }], { bounds: hero.bounds, yaw: -.25, pitch: .35, index: Math.floor(hero.index), trail: 1100, ghost: true, grid: false, headGlow: true });hero.dirty = false; }
  }
  if (sensitivity.data && visible($('sensitivity-canvas'))) {
    if (sensitivity.playing) {
      sensitivity.index = Math.min(4000, sensitivity.index + frameDelta * 100 * Number($('sensitivity-speed').value));sensitivity.dirty = true;
      if (sensitivity.index >= 4000) { sensitivity.playing = false;buttonState('sensitivity-play', false); }
    }
    if (sensitivity.dirty) drawSensitivity();
  }
  if (forecast.data && visible($('forecast').querySelector('.experiment-shell'))) {
    if (forecast.playing) {
      const rate = forecast.data.config.displayHorizon / 25 / forecast.data.config.dt;
      forecast.index = Math.min(forecastLimit(), forecast.index + frameDelta * rate * Number($('forecast-speed').value));forecast.dirty = true;
      if (forecast.index >= forecastLimit()) { forecast.playing = false;buttonState('forecast-play', false); }
    }
    if (forecast.dirty) drawForecast();
  }
  if (gallery.data && visible($('gallery').querySelector('.atlas-layout'))) {
    if (gallery.playing) {
      const max = galleryLimit();
      gallery.index = (gallery.index + frameDelta * (1 / gallery.config.dt) * Number($('gallery-speed').value)) % max;gallery.dirty = true;
    }
    if (gallery.dirty) drawGallery();
  }
  physicalForecast.tick(frameDelta);
}

async function start() {
  const controls = [...document.querySelectorAll('button, input, select')];
  controls.forEach(control => { control.disabled = true; });
  manifest = await loadManifest(new URL('../data/manifest.json', import.meta.url));
  $('provenance').textContent = `Source snapshot: ${manifest.researchCommit}. Saved run: ${manifest.run}. Display arrays use Float32; episode events are copied unchanged. Comparison errors are computed from the original stored forecasts. Section 04 adds separate physical forecasting experiments, with methods below each comparison. The downloadable data/manifest.json records source and export SHA-256 hashes, numerical settings, scores, and origin selection.`;
  const manifestLink = document.createElement('a');manifestLink.href = './data/manifest.json';manifestLink.textContent = ' Open data manifest →';$('provenance').append(manifestLink);
  hero.data = await loadArray(manifest.gallery.lorenz.states);hero.bounds = boundsOf([{ data: hero.data, width: 3 }]);
  requestAnimationFrame(animate);
  buttonState('gallery-play', gallery.playing);
  await Promise.all([configureSystem(), loadSensitivity(), selectGallery('pendulum')]);
  controls.forEach(control => { control.disabled = false; });
}
run(start);
