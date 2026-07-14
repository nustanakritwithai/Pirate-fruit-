import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import type { MonsterType } from '../monster/MonsterData';

/**
 * Runtime subset of Quaternius' Pirate Kit.
 * Source/license: client/public/assets/third-party/quaternius-pirate-kit/LICENSE.md
 */
export type PirateAssetId =
  | 'henry'
  | 'mako'
  | 'pirate-captain'
  | 'sharky'
  | 'skeleton';

const ASSET_FILES: Record<PirateAssetId, string> = {
  henry: 'henry.glb',
  mako: 'mako.glb',
  'pirate-captain': 'pirate-captain.glb',
  sharky: 'sharky.glb',
  skeleton: 'skeleton.glb',
};

const GAMEPLAY_ASSETS = Object.keys(ASSET_FILES) as PirateAssetId[];
const loader = new GLTFLoader();
const pending = new Map<PirateAssetId, Promise<GLTF>>();
const loaded = new Map<PirateAssetId, GLTF>();
let preloadPromise: Promise<void> | null = null;

function assetUrl(id: PirateAssetId): string {
  return `${import.meta.env.BASE_URL}assets/third-party/quaternius-pirate-kit/${ASSET_FILES[id]}`;
}

function loadSource(id: PirateAssetId): Promise<GLTF> {
  const ready = loaded.get(id);
  if (ready) return Promise.resolve(ready);
  const inFlight = pending.get(id);
  if (inFlight) return inFlight;

  const request = loader.loadAsync(assetUrl(id))
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

/** โหลด asset ที่ใช้งานจริงระหว่าง loading screen; asset ใดเสียจะ fallback procedural เฉพาะตัวนั้น */
export function preloadPirateGameAssets(): Promise<void> {
  if (preloadPromise) return preloadPromise;
  preloadPromise = Promise.allSettled(GAMEPLAY_ASSETS.map((id) => loadSource(id)))
    .then((results) => {
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.warn(`[PirateAssetLibrary] ใช้ procedural fallback สำหรับ ${GAMEPLAY_ASSETS[index]}`, result.reason);
        }
      });
    });
  return preloadPromise;
}

export interface PirateAssetInstance {
  root: THREE.Group;
  animations: readonly THREE.AnimationClip[];
  /** geometry/texture มาจาก cache กลาง; instance เป็นเจ้าของเฉพาะ material clone */
  disposeMaterials(): void;
}

function cloneInstanceMaterials(root: THREE.Object3D): THREE.Material[] {
  const owned: THREE.Material[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const clones = source.map((material) => {
      const clone = material.clone();
      owned.push(clone);
      return clone;
    });
    mesh.material = Array.isArray(mesh.material) ? clones : clones[0];
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
  });
  return owned;
}

/** clone skeleton อย่างถูกต้อง เพื่อให้มอนสเตอร์หลายตัวเล่น animation แยกกันได้ */
export function instantiatePirateAsset(id: PirateAssetId): PirateAssetInstance | null {
  const source = loaded.get(id);
  if (!source) return null;
  const root = SkeletonUtils.clone(source.scene) as THREE.Group;
  root.name = `quaternius:${id}`;
  const materials = cloneInstanceMaterials(root);
  return {
    root,
    animations: source.animations,
    disposeMaterials: () => materials.forEach((material) => material.dispose()),
  };
}

/** โมเดลมีอาวุธตัวอย่างติด rig มา ผู้เล่นใช้ EquipmentVisuals ของเกมจึงต้องซ่อนของเดิม */
export function hideEmbeddedPirateWeapons(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (object.name.startsWith('Weapon_')) object.visible = false;
  });
}

/** เลือก asset ตามชนิดศัตรูโดยไม่เปลี่ยน MonsterData/AI/Combat */
export function pirateAssetForMonster(type: Pick<MonsterType, 'id' | 'kind'>): PirateAssetId | null {
  if (type.id === 'boss' || type.id === 'pirate-captain') return 'pirate-captain';
  if (type.id === 'ash-cultist') return 'skeleton';
  if (type.id === 'jungle-bandit' || type.id === 'frost-raider' || type.id === 'sky-raider') {
    return 'sharky';
  }
  if (
    type.id === 'grunt' ||
    type.id === 'pirate-deckhand' ||
    type.id === 'desert-raider'
  ) {
    return 'mako';
  }
  return null;
}

