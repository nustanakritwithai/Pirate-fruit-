import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const dist = new URL('../client/dist/', import.meta.url);
const assets = join(dist.pathname, 'assets');
const files = await readdir(assets);
const music = files.filter((file) => file.endsWith('.mp3'));
const expected = [
  'island-devil-fruit-fury',
  'sailing-moon-treasure-a',
  'sailing-moon-treasure-b',
];

if (music.length !== expected.length) {
  throw new Error(`Expected ${expected.length} emitted music files, found ${music.length}: ${music.join(', ')}`);
}
for (const prefix of expected) {
  const match = music.find((file) => file.startsWith(`${prefix}-`));
  if (!match || !/-[A-Za-z0-9_-]{8}\.mp3$/.test(match)) {
    throw new Error(`Missing content-hashed asset for ${prefix}: ${music.join(', ')}`);
  }
  if (!/^[\x00-\x7F]+$/.test(match)) throw new Error(`Non-ASCII production audio URL: ${match}`);
  if ((await stat(join(assets, match))).size <= 0) throw new Error(`Empty audio asset: ${match}`);
}

const scripts = files.filter((file) => file.endsWith('.js'));
for (const script of scripts) {
  const source = await readFile(join(assets, script), 'utf8');
  if (/data:audio\/(?:mpeg|mp3|wav|ogg);base64/i.test(source)) {
    throw new Error(`Audio was embedded as base64 in ${script}`);
  }
}
console.log(`Audio asset gate passed: ${music.join(', ')}`);
