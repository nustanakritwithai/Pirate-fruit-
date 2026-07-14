/** ระบบสเตตัส — อ้างอิง https://blox-fruits.fandom.com/wiki/Stats */

/** สเตตัส 5 แบบใน Blox Fruits + 'mana' (พลังเวท) ที่เพิ่มเข้ามาสำหรับระบบ MP */
export type BloxStatId = 'melee' | 'defense' | 'sword' | 'gun' | 'fruit' | 'mana';

/** แมปกับ PlayerStatId ใน progression */
export type InternalStatId = 'combat' | 'vitality' | 'blade' | 'ranged' | 'fruitPower' | 'mana';

export type StatEffectKind = 'damage' | 'health' | 'energy' | 'mana';

export interface StatEffect {
  kind: StatEffectKind;
  /** ค่าเพิ่มต่อ 1 แต้มสเตตัส */
  perPoint: number;
  /** ประเภทความเสียหายที่ได้รับผล (ถ้าเป็น damage) */
  appliesTo?: readonly ('fighting-style' | 'sword' | 'gun' | 'fruit')[];
}

export interface StatDefinition {
  id: BloxStatId;
  /** ชื่อในเกม Blox Fruits */
  name: string;
  nameTh: string;
  wikiUrl: string;
  description: string;
  effects: readonly StatEffect[];
  /** แมปไป stat ภายในเกมเรา */
  internalId: InternalStatId;
}

export type StatBuildTier = 'max-level' | 'level-1300';

export interface StatBuildPreset {
  id: string;
  name: string;
  nameTh: string;
  tier: StatBuildTier;
  description: string;
  /** ค่าสเตตัสที่แนะนำ (1 = ไม่ลงแต้ม) */
  allocation: Readonly<Record<BloxStatId, number>>;
  tags: readonly string[];
}

export interface StatRefundSource {
  id: string;
  name: string;
  nameTh: string;
  cost: string;
  description: string;
}

export interface StatsSystemConfig {
  statPointsPerLevel: number;
  maxPointsPerStat: number;
  maxStatsFullyMaxed: number;
  maxPlayerLevel: number;
  masteryMaxLevel: number;
  masteryMaxBonusStatPoints: number;
  maxStatWithMasteryBonus: number;
  damagePerStatPoint: number;
  damageMultiplierAtMax: number;
  healthPerDefensePoint: number;
  energyPerMeleePoint: number;
  /** MP ที่เพิ่มต่อ 1 แต้มสเตต "พลังเวท" */
  manaPerManaPoint: number;
  meleeDamagePerPoint: number;
}
