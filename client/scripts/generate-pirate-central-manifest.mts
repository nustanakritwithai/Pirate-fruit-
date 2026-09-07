import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PIRATE_CENTRAL_SPATIAL_MANIFEST_JSON,
  PIRATE_CENTRAL_SPATIAL_VECTORS_JSON,
  PIRATE_CENTRAL_SPATIAL_EVALUATOR_JSON,
} from '../src/monster/PirateCentralContentManifest';

const output = resolve(import.meta.dirname, '../src/monster/pirate-central-spatial.manifest.json');
writeFileSync(output, PIRATE_CENTRAL_SPATIAL_MANIFEST_JSON, 'utf8');
writeFileSync(resolve(import.meta.dirname, '../src/monster/pirate-central-spatial.vectors.json'), PIRATE_CENTRAL_SPATIAL_VECTORS_JSON, 'utf8');
writeFileSync(resolve(import.meta.dirname, '../src/monster/pirate-central-spatial.evaluator.json'), PIRATE_CENTRAL_SPATIAL_EVALUATOR_JSON, 'utf8');
console.log(output);
