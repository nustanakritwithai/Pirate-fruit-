import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

await import('./build-economy-engine.mjs');

await build({
  entryPoints: ['src/world/centralWorker.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'dist/centralWorker.mjs',
  sourcemap: true,
});

const economySource = resolve('dist/economy-engine.js');
await mkdir('dist', { recursive: true });
await copyFile(economySource, resolve('dist/economy-engine.mjs'));
await copyFile(`${economySource}.map`, resolve('dist/economy-engine.mjs.map'));
