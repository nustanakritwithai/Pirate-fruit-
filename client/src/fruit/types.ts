/** ข้อมูลอ้างอิงจาก Blox Fruits Wiki — https://blox-fruits.fandom.com/wiki/Blox_Fruits */
export type FruitRarity = 'common' | 'uncommon' | 'rare' | 'legendary' | 'mythical';
export type FruitType = 'natural' | 'elemental' | 'beast';

export interface DevilFruitDefinition {
  /** slug เช่น flame, ice, dragon */
  id: string;
  /** ชื่อภาษาอังกฤษจากเกม */
  name: string;
  /** ชื่อภาษาไทย (ชุมชน) */
  nameTh: string;
  wikiUrl: string;
  rarity: FruitRarity;
  type: FruitType;
  /** ราคา Beli จาก Dealer */
  price: number;
  robux: number;
  hasM1: boolean;
  /** ค่า Fragment สำหรับ Awakening ทั้งชุด (ถ้ามี) */
  awakeningCost: number | null;
  /** ค่า Fragment สำหรับ Upgrade (Eagle/Lightning/Pain/Gravity) */
  upgradeCost: number | null;
  passives: readonly string[];
  /** skill id ทั้งหมดของผลนี้ */
  skillIds: readonly string[];
  /** จัดกลุ่มสกิลตาม moveset เช่น v1, v2, transformed */
  movesets: Readonly<Record<string, readonly string[]>>;
}
