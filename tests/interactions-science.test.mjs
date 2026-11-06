import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { firstSeparation, logisticBifurcation, lorenzTrajectory, observedPeriod, pendulumPhase, sensitivityPair, standardizeProjection, waterwheelPhase } from '../src/dynamics.js';
import { decodeFloat32, logisticTrajectory } from '../src/math.js';

test('live Lorenz integration converges under step refinement over a short window', () => {
  const a = lorenzTrajectory([1, 1, 1], 10, .01, .001);
  const b = lorenzTrajectory([1, 1, 1], 10, .01, .0005);
  const c = lorenzTrajectory([1, 1, 1], 10, .01, .00025);
  const difference = (x, y) => Math.max(...x.map((v, i) => Math.abs(v - y[i])));
  assert.ok(difference(b, c) < 1e-8);
  assert.ok(difference(a, c) > difference(b, c) * 10, 'Expected fourth-order convergence');
});

test('browser Lorenz paths agree with the independent SciPy export before divergence', async () => {
  const root = new URL('../data/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  const descriptor = manifest.sensitivity.pairs['-6'];
  const bytes = await readFile(new URL(descriptor.file, root));
  const source = decodeFloat32(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), descriptor);
  const live = lorenzTrajectory([1, 1, 1], 10);
  for (let i = 0; i < live.length / 3; i++) for (let j = 0; j < 3; j++) {
    assert.ok(Math.abs(live[i * 3 + j] - source[i * 6 + j]) < 4e-6, 'Within Float32 reference precision over 0..10');
  }
});

test('butterfly slider preserves tiny initial differences and shifts example separation time', () => {
  const reference = lorenzTrajectory([1, 1, 1]);
  const small = sensitivityPair(1e-8, reference), large = sensitivityPair(.01, reference);
  assert.ok(Math.abs(small.separation[0] / 1e-8 - 1) < 1e-7);
  assert.ok(small.horizon > large.horizon + 5);
  for (const result of [small, large]) {
    const i = Math.round(result.horizon / .01);
    assert.ok(result.separation[i] >= 1);
    assert.ok(result.separation.subarray(0, i).every(x => x < 1));
  }
  assert.equal(firstSeparation(Float64Array.of(.01, .1, .01), .01), null);
  assert.equal(firstSeparation(Float64Array.of(.1, 1.1, .1), .01), .01);
});

test('sensitivity accepts differences through 1 and rejects out-of-range values', () => {
  const result = sensitivityPair(.1);
  assert.ok(Math.abs(result.separation[0] - .1) < 1e-14);
  assert.ok(result.data.every(Number.isFinite));
  const largest = sensitivityPair(1);
  assert.equal(largest.separation[0], 1);
  assert.ok(largest.data.every(Number.isFinite));
  assert.throws(() => sensitivityPair(1.001), RangeError);
});

test('bifurcation columns reproduce stable fixed points, period two, and period three', () => {
  for (const [r, period] of [[2.9, 1], [3.2, 2], [3.83, 3]]) {
    const values = logisticTrajectory(r, .2, 96, 1000);
    assert.equal(observedPeriod(values), period);
    const points = logisticBifurcation(r, r + .001, 2);
    for (let i = 0; i < 96; i++) {
      assert.equal(points[i * 2], r);
      assert.equal(points[i * 2 + 1], values[i]);
    }
  }
  assert.equal(observedPeriod(logisticTrajectory(3.9, .2, 240, 1000)), null);
});

test('physical projections use the correct pendulum coordinates and actual rotating bucket masses', () => {
  assert.deepEqual(Array.from(pendulumPhase(Float64Array.of(1, 2, 3, 4, 5, 6, 7, 8))), [1, 3, 5, 7]);
  // Four buckets, all mass at bucket 1; a quarter-turn rotates its sine moment into -cosine.
  const values = waterwheelPhase(Float64Array.of(0, 2, 0, 1, 0, 0, Math.PI / 2, -2, 0, 1, 0, 0), 4);
  assert.equal(values[0], 2);assert.ok(Math.abs(values[1] - 1) < 1e-12);assert.ok(Math.abs(values[2]) < 1e-12);
  assert.equal(values[3], -2);assert.ok(Math.abs(values[4]) < 1e-12);assert.ok(Math.abs(values[5] + 1) < 1e-12);
  const standardized = standardizeProjection(Float64Array.of(1, 10, 3, 30), 2);
  assert.deepEqual(Array.from(standardized), [-1, -1, 1, 1]);
});
