import type * as THREE from 'three';
import type { GraphicsProfile } from '../engine/GraphicsQuality';
import type { CollisionSystem } from '../world/Collision';

/** อาคาร low-poly จาก Medieval Village Pack (CC0); มี procedural fallback หากโหลดไม่ได้ */
export type PirateBuildingAssetId =
  | 'house'
  | 'house-alt'
  | 'inn'
  | 'blacksmith'
  | 'barracks'
  | 'gazebo';

export function preloadPirateBuildingAssets(): Promise<void> {
  // Procedural buildings are already present; external model loading is disabled.
  return Promise.resolve();
}

export interface PirateBuildingInstance {
  root: THREE.Group;
  bounds: { height: number; minY: number };
  disposeMaterials(): void;
}

export function instantiatePirateBuildingAsset(
  _id: PirateBuildingAssetId,
  _tint?: number,
): PirateBuildingInstance | null {
  return null;
}

/** วางโมเดลพร้อมยึดฐานกับ terrain และใช้ collider เดิมของ POI */
export function addPirateBuildingAsset(
  parent: THREE.Object3D,
  collision: CollisionSystem,
  graphics: GraphicsProfile,
  id: PirateBuildingAssetId,
  x: number,
  z: number,
  rotation: number,
  targetHeight: number,
  colliderRadius: number,
): boolean {
  const instance = instantiatePirateBuildingAsset(id);
  if (!instance) return false;
  const y = collision.heightAt(x, z);
  const scale = targetHeight / instance.bounds.height;
  instance.root.scale.setScalar(scale);
  instance.root.position.set(x, y - instance.bounds.minY * scale, z);
  instance.root.rotation.y = rotation;
  instance.root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = graphics.shadows;
      mesh.receiveShadow = graphics.shadows;
    }
  });
  parent.add(instance.root);
  collision.addCollider({ x, z, radius: colliderRadius, minY: y - 1, maxY: y + targetHeight + 0.5 });
  return true;
}

/** โหลดอาคารเบื้องหลังแล้วแทนที่ procedural fallback โดยไม่บล็อกการสร้างเกาะ */
export function upgradePirateBuildingAssetWhenReady(
  parent: THREE.Object3D,
  collision: CollisionSystem,
  graphics: GraphicsProfile,
  id: PirateBuildingAssetId,
  x: number,
  z: number,
  rotation: number,
  targetHeight: number,
  colliderRadius: number,
  fallback: THREE.Object3D,
): void {
  // Keep the caller's procedural fallback and issue no network request.
  void parent; void collision; void graphics; void id; void x; void z;
  void rotation; void targetHeight; void colliderRadius; void fallback;
}
