import type * as THREE from 'three';
import type { GraphicsProfile } from '../engine/GraphicsQuality';
import type { BoatDefinition } from './BoatData';

/** โหลดเรือทั้งหมดแบบ background ไม่บล็อกการเข้าเกม */
export function preloadBoatAssets(): void {
  // Boats remain on their code-generated fallback visuals.
}

export function upgradeBoatVisualWhenReady(
  root: THREE.Group,
  fallback: THREE.Group,
  definition: BoatDefinition,
  graphics: GraphicsProfile,
): void {
  // The procedural boat is the final visual in bandwidth-minimal mode.
  void root; void fallback; void definition; void graphics;
}
