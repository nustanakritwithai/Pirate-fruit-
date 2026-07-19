import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const dist = new URL('../client/dist/', import.meta.url);
const assets = join(dist.pathname, 'assets');
const files = await readdir(dist, { recursive: true });
const binaryAssets = files.filter((file) => /\.(?:mp3|glb)$/i.test(file));
if (binaryAssets.length !== 0) {
  throw new Error(`Procedural-only build emitted binary assets: ${binaryAssets.join(', ')}`);
}

const scripts = files.filter((file) => file.endsWith('.js'));
for (const script of scripts) {
  const source = await readFile(join(dist.pathname, script), 'utf8');
  if (/data:audio\/(?:mpeg|mp3|wav|ogg);base64/i.test(source)) {
    throw new Error(`Audio was embedded as base64 in ${script}`);
  }
}
console.log('Procedural asset gate passed: 0 MP3, 0 GLB, 0 base64 audio');
