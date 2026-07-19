import type * as THREE from 'three';
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

/** Compatibility no-op: demo mode never requests an external character model. */
export function preloadPirateGameAssets(): Promise<void> {
  return Promise.resolve();
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

/** Always select the existing code-generated visual in demo mode. */
export function instantiatePirateAsset(
  _id: PirateAssetId,
  _options: PirateAssetInstanceOptions = {},
): PirateAssetInstance | null {
  return null;
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
