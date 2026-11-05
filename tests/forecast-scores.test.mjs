import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decodeFloat32 } from '../src/math.js';

const root = new URL('../data/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
async function array(descriptor) {
  const bytes = await readFile(new URL(descriptor.file, root));
  return decodeFloat32(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), descriptor);
}

test('all 60 score summaries agree with independent playback-array calculations', async () => {
  let cases = 0;
  for (const system of Object.values(manifest.systems)) {
    const d = system.dimensions, n = system.samples;
    for (const origin of system.origins) {
      const truth = await array(origin.truth);
      for (const model of Object.values(origin.models)) {
        const rows = await array(model.values), width = model.values.shape[1], scores = model.scores;
        const squared = Array(d).fill(0), absolute = Array(d).fill(0);
        let normalized = 0, early = 0;
        for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) {
          const error = rows[i * width + j] - truth[i * d + j];
          squared[j] += error ** 2;absolute[j] += Math.abs(error);
          const scaled = (error / system.trainingScales[j]) ** 2;
          normalized += scaled;if (i < 180) early += scaled;
        }
        const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 5e-6 * Math.max(1, expected), `${actual} vs ${expected}`);
        close(scores.fullNormalizedRmse, Math.sqrt(normalized / (n * d)));
        close(scores.shortNormalizedRmse, Math.sqrt(early / (180 * d)));
        for (let j = 0; j < d; j++) {
          close(scores.rmseByState[j], Math.sqrt(squared[j] / n));
          close(scores.maeByState[j], absolute[j] / n);
        }
        assert.equal(scores.shortSteps, 180);assert.equal(scores.shortTime, 180 * system.dt);
        cases++;
      }
    }
  }
  assert.equal(cases, 60);
});
