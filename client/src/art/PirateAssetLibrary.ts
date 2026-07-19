import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import type { MonsterType } from '../monster/MonsterData';

/**
 * Runtime character catalogue from Quaternius' CC0 packs.
 * Source/license notices live beside each pack under public/assets/third-party.
 */
export type PirateAssetId =
  | 'henry'
  | 'anne'
  | 'mako'
  | 'pirate-captain'
  | 'sharky'
  | 'skeleton'
  | 'spider'
  | 'goleling'
  | 'goleling-evolved'
  | 'yeti'
  | 'hywirl'
  | 'demon'
  | 'alien'
  | 'alpaking'
  | 'armabee'
  | 'armabee-evolved'
  | 'blue-demon'
  | 'cactoro'
  | 'dragon'
  | 'ghost'
  | 'ghost-skull'
  | 'glub'
  | 'mushroom-king'
  | 'ninja'
  | 'orc-enemy'
  | 'tribal';

const ASSET_FILES: Record<PirateAssetId, string> = {
  henry: 'quaternius-pirate-kit/henry.glb',
  anne: 'quaternius-pirate-kit/anne.glb',
  mako: 'quaternius-pirate-kit/mako.glb',
  'pirate-captain': 'quaternius-pirate-kit/pirate-captain.glb',
  sharky: 'quaternius-pirate-kit/sharky.glb',
  skeleton: 'quaternius-pirate-kit/skeleton.glb',
  spider: 'quaternius-easy-enemies/spider.glb',
  goleling: 'quaternius-ultimate-monsters/goleling.glb',
  'goleling-evolved': 'quaternius-ultimate-monsters/goleling-evolved.glb',
  yeti: 'quaternius-ultimate-monsters/yeti.glb',
  hywirl: 'quaternius-ultimate-monsters/hywirl.glb',
  demon: 'quaternius-ultimate-monsters/demon.glb',
  alien: 'quaternius-ultimate-monsters/alien.glb',
  alpaking: 'quaternius-ultimate-monsters/alpaking.glb',
  armabee: 'quaternius-ultimate-monsters/armabee.glb',
  'armabee-evolved': 'quaternius-ultimate-monsters/armabee-evolved.glb',
  'blue-demon': 'quaternius-ultimate-monsters/blue-demon.glb',
  cactoro: 'quaternius-ultimate-monsters/cactoro.glb',
  dragon: 'quaternius-ultimate-monsters/dragon.glb',
  ghost: 'quaternius-ultimate-monsters/ghost.glb',
  'ghost-skull': 'quaternius-ultimate-monsters/ghost-skull.glb',
  glub: 'quaternius-ultimate-monsters/glub.glb',
  'mushroom-king': 'quaternius-ultimate-monsters/mushroom-king.glb',
  ninja: 'quaternius-ultimate-monsters/ninja.glb',
  'orc-enemy': 'quaternius-ultimate-monsters/orc-enemy.glb',
  tribal: 'quaternius-ultimate-monsters/tribal.glb',
};

// Procedural-only mode: keep the catalogue for deterministic fallback selection,
// but never preload an external model.
const GAMEPLAY_ASSETS: PirateAssetId[] = [];
const loader = new GLTFLoader();
const pending = new Map<PirateAssetId, Promise<GLTF>>();
const loaded = new Map<PirateAssetId, GLTF>();
let preloadPromise: Promise<void> | null = null;

function assetUrl(id: PirateAssetId): string {
  return `${import.meta.env.BASE_URL}assets/third-party/${ASSET_FILES[id]}`;
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
  bounds: Readonly<{
    height: number;
    minY: number;
  }>;
  /** geometry/texture มาจาก cache กลาง; instance เป็นเจ้าของเฉพาะ material clone */
  disposeMaterials(): void;
}

export interface PirateAssetInstanceOptions {
  /** สีไบโอม ใช้ผสมกับสี material เดิม ไม่ทับ texture/PBR เดิม */
  tint?: number;
  tintStrength?: number;
}

function cloneInstanceMaterials(
  root: THREE.Object3D,
  options: PirateAssetInstanceOptions,
): THREE.Material[] {
  const owned: THREE.Material[] = [];
  const tint = options.tint === undefined ? null : new THREE.Color(options.tint);
  const tintStrength = THREE.MathUtils.clamp(options.tintStrength ?? 0.2, 0, 0.65);
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const clones = source.map((material) => {
      const clone = material.clone();
      const colorMaterial = clone as THREE.Material & { color?: THREE.Color };
      if (tint && colorMaterial.color) colorMaterial.color.lerp(tint, tintStrength);
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

/**
 * SkeletonUtils.clone() rebinds cloned SkinnedMesh instances and, with some
 * GLB exports, rebuilds bindMatrixInverse from the identity bind matrix. The
 * source asset still has the correct inverse armature transform, so preserve
 * both matrices before measuring/scaling the instance.
 */
function restoreSkinnedBindMatrices(source: THREE.Object3D, clone: THREE.Object3D): void {
  const sourceMeshes: THREE.SkinnedMesh[] = [];
  const clonedMeshes: THREE.SkinnedMesh[] = [];
  source.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (mesh.isSkinnedMesh) sourceMeshes.push(mesh);
  });
  clone.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh;
    if (mesh.isSkinnedMesh) clonedMeshes.push(mesh);
  });

  clonedMeshes.forEach((mesh, index) => {
    const sourceMesh = sourceMeshes[index];
    if (!sourceMesh) return;
    mesh.bindMatrix.copy(sourceMesh.bindMatrix);
    mesh.bindMatrixInverse.copy(sourceMesh.bindMatrixInverse);
  });
}

/** clone skeleton อย่างถูกต้อง เพื่อให้มอนสเตอร์หลายตัวเล่น animation แยกกันได้ */
export function instantiatePirateAsset(
  id: PirateAssetId,
  options: PirateAssetInstanceOptions = {},
): PirateAssetInstance | null {
  const source = loaded.get(id);
  if (!source) return null;
  const root = SkeletonUtils.clone(source.scene) as THREE.Group;
  restoreSkinnedBindMatrices(source.scene, root);
  root.name = `quaternius:${id}`;
  const materials = cloneInstanceMaterials(root, options);
  const box = new THREE.Box3().setFromObject(root);
  const measuredHeight = box.max.y - box.min.y;
  const height = Number.isFinite(measuredHeight) && measuredHeight > 0.01 ? measuredHeight : 1.5;
  const minY = Number.isFinite(box.min.y) ? box.min.y : 0;
  return {
    root,
    animations: source.animations,
    bounds: { height, minY },
    disposeMaterials: () => materials.forEach((material) => material.dispose()),
  };
}

/** โมเดลมีอาวุธตัวอย่างติด rig มา ผู้เล่นใช้ EquipmentVisuals ของเกมจึงต้องซ่อนของเดิม */
export function hideEmbeddedPirateWeapons(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (object.name.startsWith('Weapon_')) object.visible = false;
  });
}

export interface MonsterAssetSelection extends PirateAssetInstanceOptions {
  id: PirateAssetId;
  /** ความสูงโมเดลฐานก่อนคูณ MonsterType.scale */
  baseHeight: number;
}

interface MonsterAssetPreset {
  id: PirateAssetId;
  baseHeight: number;
  tintStrength: number;
}

/**
 * ใช้หลาย silhouette ที่เข้ากับ biome เดียวกัน เพื่อไม่ให้มอนสเตอร์ในค่ายเดียว
 * กลายเป็น clone กันทั้งหมด โดยเลือกแบบ deterministic จากตำแหน่งเกิด
 * (respawn แล้วจึงยังได้ตัวเดิม ไม่กระพริบเปลี่ยนตัวระหว่างเกม)
 */
const MONSTER_ASSET_VARIANTS: Record<string, readonly MonsterAssetPreset[]> = {
  'pirate-deckhand': [
    { id: 'mako', baseHeight: 2.05, tintStrength: 0.12 },
    { id: 'sharky', baseHeight: 2.05, tintStrength: 0.14 },
    { id: 'skeleton', baseHeight: 2.05, tintStrength: 0.16 },
  ],
  'pirate-captain': [{ id: 'pirate-captain', baseHeight: 2.05, tintStrength: 0.1 }],
  crab: [
    { id: 'spider', baseHeight: 1.2, tintStrength: 0.28 },
    { id: 'glub', baseHeight: 1.45, tintStrength: 0.25 },
    { id: 'armabee', baseHeight: 1.35, tintStrength: 0.25 },
  ],
  grunt: [
    { id: 'henry', baseHeight: 2.05, tintStrength: 0.12 },
    { id: 'mako', baseHeight: 2.05, tintStrength: 0.12 },
    { id: 'sharky', baseHeight: 2.05, tintStrength: 0.14 },
  ],
  boss: [
    { id: 'sharky', baseHeight: 2.05, tintStrength: 0.12 },
    { id: 'pirate-captain', baseHeight: 2.05, tintStrength: 0.1 },
    { id: 'orc-enemy', baseHeight: 2.4, tintStrength: 0.16 },
  ],
  'jungle-bandit': [
    { id: 'tribal', baseHeight: 2.2, tintStrength: 0.14 },
    { id: 'orc-enemy', baseHeight: 2.2, tintStrength: 0.14 },
    { id: 'sharky', baseHeight: 2.05, tintStrength: 0.14 },
  ],
  'ruin-guardian': [
    { id: 'mushroom-king', baseHeight: 2.35, tintStrength: 0.28 },
    { id: 'goleling', baseHeight: 2.05, tintStrength: 0.28 },
  ],
  'venom-ape-boss': [
    { id: 'alpaking', baseHeight: 2.25, tintStrength: 0.28 },
    { id: 'yeti', baseHeight: 2.15, tintStrength: 0.28 },
  ],
  'dune-scorpion': [
    { id: 'cactoro', baseHeight: 1.35, tintStrength: 0.28 },
    { id: 'spider', baseHeight: 1.2, tintStrength: 0.28 },
  ],
  'desert-raider': [
    { id: 'ninja', baseHeight: 2.05, tintStrength: 0.14 },
    { id: 'mako', baseHeight: 2.05, tintStrength: 0.12 },
    { id: 'tribal', baseHeight: 2.2, tintStrength: 0.14 },
  ],
  'sand-golem': [
    { id: 'goleling', baseHeight: 2.05, tintStrength: 0.28 },
    { id: 'mushroom-king', baseHeight: 2.2, tintStrength: 0.28 },
  ],
  'sun-guardian-boss': [
    { id: 'goleling-evolved', baseHeight: 2.15, tintStrength: 0.28 },
    { id: 'blue-demon', baseHeight: 2.4, tintStrength: 0.24 },
  ],
  'frost-crawler': [
    { id: 'glub', baseHeight: 1.45, tintStrength: 0.28 },
    { id: 'spider', baseHeight: 1.2, tintStrength: 0.28 },
    { id: 'armabee', baseHeight: 1.35, tintStrength: 0.25 },
  ],
  'frost-raider': [
    { id: 'orc-enemy', baseHeight: 2.2, tintStrength: 0.14 },
    { id: 'sharky', baseHeight: 2.05, tintStrength: 0.14 },
    { id: 'alien', baseHeight: 2.35, tintStrength: 0.18 },
  ],
  'crystal-golem': [
    { id: 'alien', baseHeight: 2.35, tintStrength: 0.25 },
    { id: 'blue-demon', baseHeight: 2.35, tintStrength: 0.25 },
    { id: 'goleling', baseHeight: 2.05, tintStrength: 0.28 },
  ],
  'frost-king-boss': [
    { id: 'yeti', baseHeight: 2.15, tintStrength: 0.28 },
    { id: 'alpaking', baseHeight: 2.25, tintStrength: 0.28 },
    { id: 'blue-demon', baseHeight: 2.45, tintStrength: 0.22 },
  ],
  'cloud-crab': [
    { id: 'armabee', baseHeight: 1.35, tintStrength: 0.28 },
    { id: 'spider', baseHeight: 1.2, tintStrength: 0.28 },
    { id: 'glub', baseHeight: 1.45, tintStrength: 0.25 },
  ],
  'sky-raider': [
    { id: 'alien', baseHeight: 2.35, tintStrength: 0.18 },
    { id: 'tribal', baseHeight: 2.2, tintStrength: 0.14 },
    { id: 'ninja', baseHeight: 2.05, tintStrength: 0.14 },
  ],
  'storm-golem': [
    { id: 'hywirl', baseHeight: 2.15, tintStrength: 0.28 },
    { id: 'dragon', baseHeight: 2.35, tintStrength: 0.22 },
    { id: 'armabee-evolved', baseHeight: 2.25, tintStrength: 0.24 },
  ],
  'tempest-lord-boss': [
    { id: 'hywirl', baseHeight: 2.15, tintStrength: 0.28 },
    { id: 'armabee-evolved', baseHeight: 2.25, tintStrength: 0.24 },
    { id: 'dragon', baseHeight: 2.45, tintStrength: 0.22 },
  ],
  'lava-crawler': [
    { id: 'ghost', baseHeight: 1.45, tintStrength: 0.24 },
    { id: 'ghost-skull', baseHeight: 1.45, tintStrength: 0.24 },
    { id: 'spider', baseHeight: 1.2, tintStrength: 0.28 },
  ],
  'ash-cultist': [
    { id: 'ghost-skull', baseHeight: 2.1, tintStrength: 0.22 },
    { id: 'skeleton', baseHeight: 2.05, tintStrength: 0.18 },
    { id: 'ghost', baseHeight: 2.1, tintStrength: 0.22 },
  ],
  'obsidian-golem': [
    { id: 'blue-demon', baseHeight: 2.35, tintStrength: 0.22 },
    { id: 'demon', baseHeight: 2.2, tintStrength: 0.28 },
    { id: 'goleling', baseHeight: 2.05, tintStrength: 0.28 },
  ],
  'magma-titan-boss': [
    { id: 'demon', baseHeight: 2.2, tintStrength: 0.28 },
    { id: 'dragon', baseHeight: 2.45, tintStrength: 0.22 },
    { id: 'blue-demon', baseHeight: 2.45, tintStrength: 0.22 },
  ],
};

function variantIndex(seed: number, variantCount: number): number {
  if (variantCount <= 1 || !Number.isFinite(seed)) return 0;
  return Math.abs(Math.trunc(seed * 1000)) % variantCount;
}

/** เลือก asset ตามชนิดศัตรูโดยไม่เปลี่ยน MonsterData/AI/Combat */
export function pirateAssetForMonster(
  type: Pick<MonsterType, 'id' | 'kind' | 'color'>,
  variantSeed = 0,
): MonsterAssetSelection | null {
  const variants = MONSTER_ASSET_VARIANTS[type.id];
  if (!variants?.length) return null;
  const preset = variants[variantIndex(variantSeed, variants.length)];
  return {
    id: preset.id,
    baseHeight: preset.baseHeight,
    tint: type.color,
    tintStrength: preset.tintStrength,
  };
}

const ANNE_NPCS = new Set([
  'village-chief-mali',
  'fruit-researcher-lin',
  'market-trader-nok',
  'explorer-dara',
  'archaeologist-wan',
  'field-medic-sai',
  'dock-trader-lamai',
  'caravan-chief-amara',
  'sunscar-dealer-zahra',
  'frost-chief-nalin',
  'frost-dealer-iris',
  'frost-scholar-yura',
  'tempest-dealer-sora',
  'tempest-scholar-megha',
  'ember-dealer-rin',
  'ember-scholar-ada',
]);

export interface NPCAssetHint {
  id: string;
  color: number;
  action?: string;
}

/** NPC ทุกเกาะใช้ rig เดียวกันและคง Dialogue/Action เดิมทั้งหมด */
export function pirateAssetForNPC(npc: NPCAssetHint): MonsterAssetSelection {
  const id: PirateAssetId = ANNE_NPCS.has(npc.id)
    ? 'anne'
    : npc.action === 'boat-shop' || npc.id.includes('shipwright')
      ? 'mako'
      : npc.action === 'quest-board'
        ? 'pirate-captain'
        : 'henry';
  return { id, baseHeight: 2.12, tint: npc.color, tintStrength: 0.16 };
}
