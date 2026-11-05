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
const near = (actual, expected) => assert.ok(Math.abs(actual-expected) < 1e-5*Math.max(1,Math.abs(expected)), `${actual} != ${expected}`);

test('section 04 contains only the two physical mechanisms with separate fitted forecasts', () => {
  assert.deepEqual(Object.keys(models), ['pendulum', 'waterwheel']);
  for (const slug of Object.keys(models)) {
    const c = manifest.physicalForecasts[slug];
    assert.equal(c.trainingRuns,32);assert.equal(c.validationRuns,4);assert.equal(c.runs.length,3);
    assert.match(c.model,/MLP/);assert.equal(c.seed,7);
  }
});

test('physical forecast playback, visible motion errors, and scores agree independently', async () => {
  let failures = 0;
  for (const [slug,c] of Object.entries(manifest.physicalForecasts)) for (const run of c.runs) {
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
      near(mismatch[i],error);
      let scaled = 0;
      for(let j=0;j<d;j++){
        let e=prediction[i*d+j]-truth[i*d+j];
        if(j<(slug==='pendulum'?2:1))e=Math.atan2(Math.sin(e),Math.cos(e));
        scaled+=(e/c.trainingScales[j])**2;
      }
      near(normalized[i],Math.sqrt(scaled/d));
      full+=error*error;
      if(i<=Math.round(1.8/c.dt)){early+=error*error;earlyCount++;}
    }
    near(Math.sqrt(early/earlyCount),run.scores.earlyMotionRmse);
    near(Math.sqrt(full/(n-1)),run.scores.savedMotionRmse);
    if(run.failure){
      failures++;assert.equal(run.scores.motionRmse,null);assert.equal(run.scores.fullNrmse,null);
      assert.ok(run.failure.time>run.savedDuration);assert.ok(run.savedDuration<c.duration);
    }else{near(run.savedDuration,c.duration);near(Math.sqrt(full/(n-1)),run.scores.motionRmse);}
  }
  assert.equal(failures,1,'preserve the unstable test example rather than dropping it');
});
