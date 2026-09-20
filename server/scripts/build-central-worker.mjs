import { build } from 'esbuild';

await build({
  entryPoints: ['src/world/centralWorker.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'dist/centralWorker.mjs',
  sourcemap: true,
});
