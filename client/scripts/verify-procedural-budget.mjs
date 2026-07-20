import { readFileSync, readdirSync } from 'node:fs';
import { brotliCompressSync, constants } from 'node:zlib';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const entryName = html.match(/assets\/(index-[^"']+\.js)/)?.[1];
if (!entryName) throw new Error('Unable to locate the production entry bundle');

const assetsUrl = new URL('../dist/assets/', import.meta.url);
const entry = readFileSync(new URL(entryName, assetsUrl));
const entryText = entry.toString('utf8');
const brotliBytes = brotliCompressSync(entry, {
  params: { [constants.BROTLI_PARAM_QUALITY]: 4 },
}).length;

const forbidden = [/\.glb\b/i, /\.gltf\b/i, /\.mp3\b/i, /night-sky/i, /assets\/textures\//i, /GLTFLoader/];
for (const pattern of forbidden) {
  if (pattern.test(entryText)) throw new Error(`Initial bundle contains forbidden asset path: ${pattern}`);
}
if (entry.length > 1_600_000) throw new Error(`Initial JS raw budget exceeded: ${entry.length}`);
if (brotliBytes > 410_000) throw new Error(`Initial JS Brotli budget exceeded: ${brotliBytes}`);

const islandChunks = readdirSync(assetsUrl).filter((name) => /Island-.*\.js$/.test(name));
if (islandChunks.length < 5) throw new Error(`Expected 5 streamed island chunks, found ${islandChunks.length}`);

console.log(JSON.stringify({
  entry: entryName,
  rawBytes: entry.length,
  brotliBytes,
  streamedIslandChunks: islandChunks.length,
}));
