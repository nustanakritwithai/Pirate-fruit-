import slimes from '../assets/catalog/monster-slimes.json' with { type: 'json' };
import animals from '../assets/catalog/monster-animals.json' with { type: 'json' };

/** Canonical presentation definitions; server actor monsterType must match exactly. */
export const OWNED_MONSTER_ASSETS = new Map(
  [...(slimes.assets || []), ...(animals.assets || [])].map((asset) => [asset.id, Object.freeze(asset)]),
);
