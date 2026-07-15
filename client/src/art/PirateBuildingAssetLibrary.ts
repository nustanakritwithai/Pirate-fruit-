import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
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

export const BUILDING_ASSET_FILES: Record<PirateBuildingAssetId, string> = {
  house: 'quaternius-medieval-village/house.glb',
  'house-alt': 'quaternius-medieval-village/house-alt.glb',
  inn: 'quaternius-medieval-village/inn.glb',
  blacksmith: 'quaternius-medieval-village/blacksmith.glb',
  barracks: 'quaternius-medieval-village/barracks.glb',
  gazebo: 'quaternius-medieval-village/gazebo.glb',
};

const IDS = Object.keys(BUILDING_ASSET_FILES) as PirateBuildingAssetId[];
const loader = new GLTFLoader();
const loaded = new Map<PirateBuildingAssetId, GLTF>();
const pending = new Map<PirateBuildingAssetId, Promise<GLTF>>();
let preloadPromise: Promise<void> | null = null;

function loadSource(id: PirateBuildingAssetId): Promise<GLTF> {
  const ready = loaded.get(id);
  if (ready) return Promise.resolve(ready);
  const inFlight = pending.get(id);
  if (inFlight) return inFlight;
  const request = loader.loadAsync(`${import.meta.env.BASE_URL}assets/third-party/${BUILDING_ASSET_FILES[id]}`)
    .then((gltf) => {
      loaded.set(id, gltf);
      pending.delete(id);
      return gltf;
    })
    .catch((error: unknown) => {
      pending.delete(id);
      throw error;
    });
  pending.set(id, request);
  return request;
}

export function preloadPirateBuildingAssets(): Promise<void> {
  if (preloadPromise) return preloadPromise;
  preloadPromise = Promise.allSettled(IDS.map(loadSource)).then((results) => {
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.warn(`[PirateBuildingAssetLibrary] ใช้ procedural fallback สำหรับ ${IDS[index]}`, result.reason);
      }
    });
  });
  return preloadPromise;
}

export interface PirateBuildingInstance {
  root: THREE.Group;
  bounds: { height: number; minY: number };
  disposeMaterials(): void;
}

export function instantiatePirateBuildingAsset(
  id: PirateBuildingAssetId,
  tint?: number,
): PirateBuildingInstance | null {
  const source = loaded.get(id);
  if (!source) return null;
  const root = SkeletonUtils.clone(source.scene) as THREE.Group;
  const owned: THREE.Material[] = [];
  const color = tint === undefined ? null : new THREE.Color(tint);
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((material) => {
      const clone = material.clone();
      const colorMaterial = clone as THREE.Material & { color?: THREE.Color };
      if (color && colorMaterial.color) colorMaterial.color.lerp(color, 0.22);
      owned.push(clone);
      return clone;
    });
    mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
  });
  const bounds = new THREE.Box3().setFromObject(root);
  const measuredHeight = bounds.max.y - bounds.min.y;
  return {
    root,
    bounds: {
      height: Number.isFinite(measuredHeight) && measuredHeight > 0.01 ? measuredHeight : 1,
      minY: Number.isFinite(bounds.min.y) ? bounds.min.y : 0,
    },
    disposeMaterials: () => owned.forEach((material) => material.dispose()),
  };
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
