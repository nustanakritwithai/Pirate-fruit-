import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outfile = resolve(serverRoot, 'dist/economy-engine.js');
await mkdir(dirname(outfile), { recursive: true });

await build({
  entryPoints: [resolve(serverRoot, 'economy-engine/entry.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  legalComments: 'none',
  logLevel: 'warning',
});
