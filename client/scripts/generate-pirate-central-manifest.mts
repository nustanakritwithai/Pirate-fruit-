import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PIRATE_CENTRAL_SPATIAL_MANIFEST_JSON } from '../src/monster/PirateCentralContentManifest';

const output = resolve(import.meta.dirname, '../src/monster/pirate-central-spatial.manifest.json');
writeFileSync(output, PIRATE_CENTRAL_SPATIAL_MANIFEST_JSON, 'utf8');
console.log(output);
