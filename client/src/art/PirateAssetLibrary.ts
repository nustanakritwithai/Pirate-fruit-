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
  | 'demon';

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
};

const GAMEPLAY_ASSETS = Object.keys(ASSET_FILES) as PirateAssetId[];
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

/** clone skeleton อย่างถูกต้อง เพื่อให้มอนสเตอร์หลายตัวเล่น animation แยกกันได้ */
export function instantiatePirateAsset(
  id: PirateAssetId,
  options: PirateAssetInstanceOptions = {},
): PirateAssetInstance | null {
  const source = loaded.get(id);
  if (!source) return null;
  const root = SkeletonUtils.clone(source.scene) as THREE.Group;
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

/** เลือก asset ตามชนิดศัตรูโดยไม่เปลี่ยน MonsterData/AI/Combat */
export function pirateAssetForMonster(
  type: Pick<MonsterType, 'id' | 'kind' | 'color'>,
): MonsterAssetSelection | null {
  const biomeTint = { tint: type.color, tintStrength: 0.28 } as const;
  if (type.id === 'boss' || type.id === 'pirate-captain') {
    return { id: 'pirate-captain', baseHeight: 2.05, tint: type.color, tintStrength: 0.1 };
  }
  if (type.id === 'ash-cultist') {
    return { id: 'skeleton', baseHeight: 2.05, tint: type.color, tintStrength: 0.18 };
  }
  if (type.id === 'jungle-bandit' || type.id === 'frost-raider' || type.id === 'sky-raider') {
    return { id: 'sharky', baseHeight: 2.05, tint: type.color, tintStrength: 0.14 };
  }
  if (
    type.id === 'grunt' ||
    type.id === 'pirate-deckhand' ||
    type.id === 'desert-raider'
  ) {
    return { id: 'mako', baseHeight: 2.05, tint: type.color, tintStrength: 0.12 };
  }
  if (
    type.id === 'crab' ||
    type.id === 'dune-scorpion' ||
    type.id === 'frost-crawler' ||
    type.id === 'cloud-crab' ||
    type.id === 'lava-crawler'
  ) return { id: 'spider', baseHeight: 1.2, ...biomeTint };
  if (
    type.id === 'ruin-guardian' ||
    type.id === 'sand-golem' ||
    type.id === 'crystal-golem' ||
    type.id === 'storm-golem' ||
    type.id === 'obsidian-golem'
  ) return { id: 'goleling', baseHeight: 2.05, ...biomeTint };
  if (type.id === 'sun-guardian-boss') {
    return { id: 'goleling-evolved', baseHeight: 2.15, ...biomeTint };
  }
  if (type.id === 'venom-ape-boss' || type.id === 'frost-king-boss') {
    return { id: 'yeti', baseHeight: 2.15, ...biomeTint };
  }
  if (type.id === 'tempest-lord-boss') {
    return { id: 'hywirl', baseHeight: 2.15, ...biomeTint };
  }
  if (type.id === 'magma-titan-boss') {
    return { id: 'demon', baseHeight: 2.2, ...biomeTint };
  }
  return null;
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
