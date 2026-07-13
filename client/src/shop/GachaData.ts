/**
 * Phase 7 — ร้านสุ่ม (Gacha) ที่ดึงของจาก databook (Blox Fruits Wiki)
 * รวมดาบ / ปืน / สไตล์ต่อสู้ / ผลไม้ ถ่วงน้ำหนักตามความหายาก
 */

import { DEVIL_FRUITS } from '../fruit/FruitRegistry';
import { SWORDS } from '../swords/SwordRegistry';
import { listAvailableGuns } from '../guns/GunRegistry';
import { FIGHTING_STYLES } from '../fighting-styles/FightingStyleRegistry';
import type { FightingStyleSeaTier } from '../fighting-styles/types';

export type ItemKind = 'sword' | 'gun' | 'fighting-style' | 'fruit';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary' | 'mythical';

/** สไตล์เริ่มต้นที่ผู้เล่นมีติดตัว (ไม่อยู่ในพูลสุ่ม) */
export const STARTER_STYLE_ID = 'combat';

/** ราคาต่อการสุ่ม 1 ครั้ง */
export const DRAW_COST = 150;

export const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 60,
  uncommon: 26,
  rare: 10,
  legendary: 3.5,
  mythical: 0.8,
};

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'ธรรมดา',
  uncommon: 'พิเศษ',
  rare: 'หายาก',
  legendary: 'ตำนาน',
  mythical: 'เทพ',
};

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#c8d2da',
  uncommon: '#7fe0a3',
  rare: '#6cc0ff',
  legendary: '#c890ff',
  mythical: '#ffcf5a',
};

export const KIND_ICON: Record<ItemKind, string> = {
  sword: '🗡️',
  gun: '🔫',
  'fighting-style': '👊',
  fruit: '🍎',
};

export const KIND_LABEL: Record<ItemKind, string> = {
  sword: 'ดาบ',
  gun: 'ปืน',
  'fighting-style': 'สไตล์ต่อสู้',
  fruit: 'ผลไม้',
};

export interface GachaEntry {
  kind: ItemKind;
  id: string;
  name: string;
  rarity: Rarity;
}

function styleRarity(tier: FightingStyleSeaTier): Rarity {
  switch (tier) {
    case 'starter':
      return 'common';
    case 'first-sea':
      return 'uncommon';
    case 'second-sea':
      return 'rare';
    default:
      return 'legendary';
  }
}

/** พูลของที่สุ่มได้ทั้งหมด (ยกเว้นสไตล์เริ่มต้น) */
export const GACHA_POOL: GachaEntry[] = [
  ...SWORDS.map((s): GachaEntry => ({ kind: 'sword', id: s.id, name: s.nameTh, rarity: s.rarity })),
  ...listAvailableGuns().map((g): GachaEntry => ({ kind: 'gun', id: g.id, name: g.nameTh, rarity: g.rarity })),
  ...FIGHTING_STYLES.filter((s) => s.id !== STARTER_STYLE_ID).map(
    (s): GachaEntry => ({ kind: 'fighting-style', id: s.id, name: s.nameTh, rarity: styleRarity(s.seaTier) }),
  ),
  ...DEVIL_FRUITS.map((f): GachaEntry => ({ kind: 'fruit', id: f.id, name: f.nameTh, rarity: f.rarity })),
];

/**
 * สุ่ม 1 ชิ้นจากพูล ถ่วงน้ำหนักตามความหายาก
 * rng() คืน 0..1 (ส่งเข้ามาเพื่อความทดสอบได้)
 */
export function drawGacha(rng: () => number = Math.random, pool: GachaEntry[] = GACHA_POOL): GachaEntry {
  const total = pool.reduce((sum, entry) => sum + RARITY_WEIGHT[entry.rarity], 0);
  let roll = rng() * total;
  for (const entry of pool) {
    roll -= RARITY_WEIGHT[entry.rarity];
    if (roll <= 0) return entry;
  }
  return pool[pool.length - 1];
}
