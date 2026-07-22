/**
 * Phase 7 — ร้านสุ่ม (Gacha) ที่ดึงของจาก databook (Blox Fruits Wiki)
 * รวมดาบ / ปืน / สไตล์ต่อสู้ / ผลไม้ ถ่วงน้ำหนักตามความหายาก
 */

import { DEVIL_FRUITS } from '../fruit/FruitRegistry';
import { SWORDS } from '../swords/SwordRegistry';
import { listAvailableGuns } from '../guns/GunRegistry';
import { FIGHTING_STYLES } from '../fighting-styles/FightingStyleRegistry';
import {
  SHOP_DRAW_COST,
  SHOP_GACHA_CATALOG,
  SHOP_RARITY_WEIGHT,
  type ShopItemKind,
  type ShopRarity,
} from '@pirate-fruit/shared';

export type ItemKind = ShopItemKind;
export type Rarity = ShopRarity;

/** สไตล์เริ่มต้นที่ผู้เล่นมีติดตัว (ไม่อยู่ในพูลสุ่ม) */
export const STARTER_STYLE_ID = 'combat';

/** ราคาต่อการสุ่ม 1 ครั้ง */
export const DRAW_COST = SHOP_DRAW_COST;

export const RARITY_WEIGHT: Record<Rarity, number> = {
  common: SHOP_RARITY_WEIGHT.common / 10,
  uncommon: SHOP_RARITY_WEIGHT.uncommon / 10,
  rare: SHOP_RARITY_WEIGHT.rare / 10,
  legendary: SHOP_RARITY_WEIGHT.legendary / 10,
  mythical: SHOP_RARITY_WEIGHT.mythical / 10,
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

/** พูลของที่สุ่มได้ทั้งหมด (ยกเว้นสไตล์เริ่มต้น) */
const itemNames = new Map<string, string>([
  ...SWORDS.map((item) => [`sword:${item.id}`, item.nameTh] as const),
  ...listAvailableGuns().map((item) => [`gun:${item.id}`, item.nameTh] as const),
  ...FIGHTING_STYLES.map((item) => [`fighting-style:${item.id}`, item.nameTh] as const),
  ...DEVIL_FRUITS.map((item) => [`fruit:${item.id}`, item.nameTh] as const),
]);

export const GACHA_POOL: GachaEntry[] = SHOP_GACHA_CATALOG.map((item) => ({
  ...item,
  name: itemNames.get(`${item.kind}:${item.id}`) ?? item.id,
}));

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
