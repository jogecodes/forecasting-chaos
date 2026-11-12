import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decodeFloat32 } from '../src/math.js';
import { models } from '../src/models.js';
const root = new URL('../data/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
async function load(descriptor) {
  const b = await readFile(new URL(descriptor.file, root));
  return decodeFloat32(b.buffer.slice(b.byteOffset, b.byteOffset+b.byteLength), descriptor);
}
const near = (actual, expected, quantization = 0) => assert.ok(Math.abs(actual-expected) < 1e-5*Math.max(1,Math.abs(expected)) + quantization, `${actual} != ${expected}`);

test('section 04 contains only the two physical mechanisms with separate fitted forecasts', () => {
  assert.deepEqual(Object.keys(models), ['pendulum', 'waterwheel']);
  for (const slug of Object.keys(models)) {
    const c = manifest.physicalForecasts[slug];
    assert.equal(c.trainingRuns,32);assert.equal(c.validationRuns,4);
    assert.deepEqual(Object.keys(c.models), ['polynomial-dynamics', 'transformer', 'gru', 'mlp']);
    for (const [family, model] of Object.entries(c.models)) {
      assert.equal(model.runs.length,3);
      assert.equal(model.window, ['transformer', 'gru'].includes(family) ? 24 : 1);
      if (family !== 'polynomial-dynamics') { assert.equal(model.seed,7);assert.equal(model.updates,3200); }
    }
  }
});

test('physical forecast playback, visible motion errors, and scores agree independently', async () => {
  let failures = 0;
  for (const [slug,c] of Object.entries(manifest.physicalForecasts)) for (const model of Object.values(c.models)) for (const run of model.runs) {
    const truth = await load(run.truth), prediction = await load(run.prediction), mismatch = await load(run.mismatch), normalized = await load(run.normalizedError);
    const d = c.dimensions, n = truth.length/d;
    assert.equal(prediction.length,truth.length);assert.equal(mismatch.length,n);
    assert.deepEqual(Array.from(prediction.slice(0,d)),Array.from(truth.slice(0,d)));
    assert.equal(mismatch[0],0);assert.equal(normalized[0],0);
    near((n-1)*c.dt,run.savedDuration);
    let early = 0, full = 0, earlyCount = 0;
    for (let i = 1;i<n;i++) {
      let error;
      if (slug==='pendulum') {
        const tip = q => [Math.sin(q[i*d])+Math.sin(q[i*d+1]),-Math.cos(q[i*d])-Math.cos(q[i*d+1])];
        const a=tip(truth),b=tip(prediction);error=Math.hypot(a[0]-b[0],a[1]-b[1]);
      } else {
        error=Math.abs(prediction[i*d+1]-truth[i*d+1]);
        for(let j=2;j<d;j++)assert.ok(prediction[i*d+j]>=-1e-5,'negative predicted bucket mass');
      }
      // Metrics use original Float64 outputs; playback angles can make many
      // turns before a display guard trips. Propagate their Float32 rounding
      // bound through sin/cos rather than requiring impossible precision.
      const eps = 2**-24;
      let motionRounding = 0;
      for (const j of slug==='pendulum' ? [0,1] : [1]) {
        motionRounding += eps*(Math.abs(truth[i*d+j])+Math.abs(prediction[i*d+j]));
      }
      near(mismatch[i],error,motionRounding);
      let scaled = 0, roundingSquared = 0;
      for(let j=0;j<d;j++){
        let e=prediction[i*d+j]-truth[i*d+j];
        if(j<(slug==='pendulum'?2:1))e=Math.atan2(Math.sin(e),Math.cos(e));
        scaled+=(e/c.trainingScales[j])**2;
        roundingSquared+=(eps*(Math.abs(truth[i*d+j])+Math.abs(prediction[i*d+j]))/c.trainingScales[j])**2;
      }
      near(normalized[i],Math.sqrt(scaled/d),Math.sqrt(roundingSquared/d));
      full+=error*error;
      if(i<=Math.round(1.8/c.dt)){early+=error*error;earlyCount++;}
    }
    if (earlyCount === Math.round(1.8/c.dt)) near(Math.sqrt(early/earlyCount),run.scores.earlyMotionRmse);
    else assert.equal(run.scores.earlyMotionRmse,null,'an incomplete early horizon cannot receive a complete score');
    near(Math.sqrt(full/(n-1)),run.scores.savedMotionRmse);
    if(run.failure){
      failures++;assert.equal(run.scores.motionRmse,null);assert.equal(run.scores.fullNrmse,null);
      assert.ok(run.failure.time>run.savedDuration);assert.ok(run.savedDuration<c.duration);
    }else{near(run.savedDuration,c.duration);near(Math.sqrt(full/(n-1)),run.scores.motionRmse);}
  }
  assert.ok(failures>=1,'preserve unstable examples rather than dropping them');
  assert.ok(manifest.physicalForecasts.pendulum.models.mlp.runs[1].failure,'retain the original unstable MLP test');
});


test('every model uses the same physical test origins and distinct learned forecasts', async () => {
  for (const config of Object.values(manifest.physicalForecasts)) {
    for (let i=0;i<3;i++) {
      const longest = Object.values(config.models).map(m => m.runs[i].truth).sort((a,b) => b.shape[0]-a.shape[0])[0];
      const reference = await load(longest);
      const hashes = new Set();
      for (const model of Object.values(config.models)) {
        const run = model.runs[i], truth = await load(run.truth);
        assert.deepEqual(truth,reference.slice(0,truth.length));
        hashes.add(run.prediction.sha256);
      }
      assert.equal(hashes.size,4,'model selection must change the saved forecast');
    }
  }
});
