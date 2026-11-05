import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildSite } from '../scripts/build.mjs';
import { loadManifest } from '../src/load.js';

test('an incomplete manifest is retried without browser-cache reuse', async () => {
  const valid = { schema: 1, systems: {}, gallery: {}, sensitivity: {} };
  let calls = 0;
  const result = await loadManifest('/data/manifest.json', async (_url, options) => {
    assert.equal(options.cache, 'no-store');
    calls++;
    return new Response(calls === 1 ? '{"schema":1,' : JSON.stringify(valid));
  });
  assert.deepEqual(result, valid);assert.equal(calls, 2);
});

test('persistent invalid manifests stop retrying and explain the data-read failure', async () => {
  let calls = 0;
  await assert.rejects(loadManifest('/data/manifest.json', async () => {
    calls++;return new Response('{');
  }), /could not be read completely/);
  assert.equal(calls, 3);
});

test('rebuilding leaves served JSON complete and preserves the previous build on invalid source', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'chaos-build-test-'));
  try {
    await mkdir(path.join(root, 'data'));await mkdir(path.join(root, 'src'));
    for (const name of ['index.html', '_headers', 'favicon.svg']) await writeFile(path.join(root, name), name);
    await writeFile(path.join(root, 'src/app.js'), '// fixture');
    const source = path.join(root, 'data/manifest.json'), target = path.join(root, 'dist/data/manifest.json');
    const old = JSON.stringify({ version: 1, payload: 'x'.repeat(500000) });
    const updated = JSON.stringify({ version: 2, payload: 'y'.repeat(750000) });
    await writeFile(source, old);await buildSite(root);
    await writeFile(source, updated);
    let finished = false, reads = 0;
    const building = buildSite(root).finally(() => { finished = true; });
    do {
      const value = JSON.parse(await readFile(target, 'utf8'));
      assert.ok([1, 2].includes(value.version));
      assert.equal(value.payload.length, value.version === 1 ? 500000 : 750000);
      reads++;
    } while (!finished);
    await building;assert.ok(reads > 0);
    assert.equal(await readFile(target, 'utf8'), updated);
    await writeFile(source, '{"version":');
    await assert.rejects(buildSite(root), SyntaxError);
    assert.equal(await readFile(target, 'utf8'), updated);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
