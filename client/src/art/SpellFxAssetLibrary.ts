import type * as THREE from 'three';

export type SpellFxAssetId =
  | 'fireball'
  | 'lightning-hands'
  | 'magic-rock'
  | 'earth-bending'
  | 'water-element'
  | 'ice-block'
  | 'fire-grenade'
  | 'smoke'
  | 'fire-hands';

/** โหลดเอฟเฟกต์แบบ background เพื่อไม่แย่งเฟรมตอนเข้าเกาะ */
export function preloadSpellFxAssets(): void {
  // Effects are generated with Three.js primitives; do not fetch model assets.
}

export interface SpellFxAssetInstance {
  root: THREE.Group;
  materials: THREE.Material[];
  disposeMaterials(): void;
}

export function instantiateSpellFxAsset(_id: SpellFxAssetId, _tint?: number): SpellFxAssetInstance | null {
  return null;
}
