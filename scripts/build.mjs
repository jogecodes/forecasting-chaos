import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export async function buildSite(root) {
  // Validate before touching the live preview. Never copy into a served file:
  // a browser may already be reading it while a build runs.
  JSON.parse(await readFile(path.join(root, 'data/manifest.json'), 'utf8'));
  const staging = await mkdtemp(path.join(root, '.chaos-build-'));
  const destination = path.join(root, 'dist');
  async function files(directory, prefix = '') {
    const result = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = path.join(prefix, entry.name);
      if (entry.isDirectory()) result.push(...await files(path.join(directory, entry.name), relative));
      else result.push(relative);
    }
    return result;
  }
  try {
    for (const entry of ['index.html', 'src', 'data', '_headers', 'favicon.svg']) {
      await cp(path.join(root, entry), path.join(staging, entry), { recursive: true });
    }
    JSON.parse(await readFile(path.join(staging, 'data/manifest.json'), 'utf8'));
    const entries = await files(staging);
    // Publish references after their assets. Keep older assets available for
    // tabs opened before this build; each file replacement itself is atomic.
    const priority = name => name === 'index.html' ? 2 : name === path.join('data', 'manifest.json') ? 1 : 0;
    entries.sort((a, b) => priority(a) - priority(b));
    for (const entry of entries) {
      const target = path.join(destination, entry);
      await mkdir(path.dirname(target), { recursive: true });
      await rename(path.join(staging, entry), target);
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

const root = fileURLToPath(new URL('../', import.meta.url));
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildSite(root);
  console.log('Static site ready in dist/ — safe to rebuild while preview is running.');
}
