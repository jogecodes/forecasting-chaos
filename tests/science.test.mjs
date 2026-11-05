import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { boundsOf, decodeFloat32, extractState, logisticTrajectory, prependState, project, trainingScaledError } from '../src/math.js';

const root = new URL('../data/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
async function load(descriptor) {
  const bytes = await readFile(new URL(descriptor.file, root));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return decodeFloat32(buffer, descriptor);
}

test('logistic period-two regime and fixed point match the update rule', () => {
  const fixed = logisticTrajectory(2.9, .2, 10, 1000);
  assert.ok(fixed.every(x => Math.abs(x - (1 - 1 / 2.9)) < 1e-10));
  const cycle = logisticTrajectory(3.2, .2, 20, 1000);
  assert.ok(Math.abs(cycle[0] - cycle[1]) > .1);
  for (let i = 2; i < cycle.length; i++) assert.ok(Math.abs(cycle[i] - cycle[i - 2]) < 1e-12);
});

test('training-normalized error excludes augmented channels and matches a known example', () => {
  const truth = Float32Array.of(1, 2, 3, 4);
  const forecast = Float32Array.of(3, 6, 3, 4);
  const errors = trainingScaledError(truth, forecast, 2, [2, 4]);
  assert.deepEqual(Array.from(errors), [1, 0]);
  assert.throws(() => trainingScaledError(truth, forecast, 3, [1, 1, 1]));
});

test('display decoder explicitly uses little endian and rejects truncated data', () => {
  const buffer = new ArrayBuffer(8), view = new DataView(buffer);
  view.setFloat32(0, 1.25, true);view.setFloat32(4, -4.5, true);
  assert.deepEqual(Array.from(decodeFloat32(buffer, { shape: [1, 2], bytes: 8 })), [1.25, -4.5]);
  assert.throws(() => decodeFloat32(buffer, { shape: [2, 2], bytes: 16 }));
});

test('all exported assets match shape, finite-value checks and SHA-256 manifest', async () => {
  const descriptors = [];
  function visit(object) {
    if (!object || typeof object !== 'object') return;
    if (object.file && object.shape) descriptors.push(object);
    for (const value of Object.values(object)) visit(value);
  }
  visit(manifest);
  assert.ok(descriptors.length > 100);
  for (const descriptor of descriptors) {
    const bytes = await readFile(new URL(descriptor.file, root));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), descriptor.sha256, descriptor.file);
    const values = await load(descriptor);
    assert.ok(values.every(Number.isFinite), descriptor.file);
  }
});

test('tiny sensitivity distances survive float32 coordinate quantization', async () => {
  for (const exponent of [-2, -4, -6, -8]) {
    const distances = await load(manifest.sensitivity.separations[exponent]);
    assert.ok(Math.abs(distances[0] / 10 ** exponent - 1) < 1e-6);
    assert.ok(Math.max(...distances) > 1, 'Near trajectories separate at finite times');
  }
});

test('forecast sampling, seed counts, episode codes and onset lead alignment are preserved', async () => {
  assert.match(manifest.researchCommit, /^[a-f0-9]{40}$/);
  for (const config of Object.values(manifest.systems)) {
    assert.deepEqual(config.origins.map(o => o.index), [0, 1, 3, 5, 7]);
    assert.equal(config.samples * config.dt, config.horizon);
    assert.ok(config.trainingScales.every(x => x > 0));
    for (const origin of config.origins) {
      assert.deepEqual(Object.keys(origin.models), ['polynomial-dynamics', 'transformer', 'gru', 'mlp']);
      for (const [slug, model] of Object.entries(origin.models)) {
        assert.equal(model.memberCount, slug === 'polynomial-dynamics' ? 1 : 3);
        const rows = await load(model.values), [n, width] = model.values.shape;
        assert.equal(n, config.samples);
        assert.equal(width, config.dimensions * (model.memberCount + 1) + 1);
        for (let i = 0; i < n; i++) assert.ok([0, 1, 2].includes(rows[i * width + width - 1]));
        if (model.onset !== null) {
          const index = Math.round(model.onset / config.dt) - 1;
          assert.equal(rows[index * width + width - 1], 2, 'Onset refers to row i at lead (i+1)dt');
          assert.ok(model.confirmation >= model.onset);
        }
      }
    }
  }
});

test('mean/member interleaving and time-zero context do not shift forecast lead one', () => {
  const rows = Float32Array.of(1, 2, 3, 4, 0, 5, 6, 7, 8, 2);
  const mean = extractState(rows, 5, 2);
  const member = extractState(rows, 5, 2, 2);
  assert.deepEqual(Array.from(mean), [1, 2, 5, 6]);
  assert.deepEqual(Array.from(member), [3, 4, 7, 8]);
  assert.deepEqual(Array.from(prependState(mean, Float32Array.of(9, 10))), [9, 10, 1, 2, 5, 6]);
});

test('state-space projection preserves common coordinate scale and finite positions', () => {
  const bounds = boundsOf([{ data: Float32Array.of(-1, -2, -3, 1, 2, 3), width: 3 }]);
  assert.deepEqual(bounds.center, [0, 0, 0]);assert.equal(bounds.extent, 6);
  const point = project([1, 2, 3], bounds, .5, .3, 800, 400);
  assert.ok(point.every(Number.isFinite));
});
