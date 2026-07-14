/**
 * ยาฟื้นฟู (consumable) — ซื้อจากร้านพ่อค้าเปา ใส่ช่องลัดไว้ใช้ตอนต่อสู้
 * ปรับค่าฟื้น/ราคาที่นี่ที่เดียว
 */

export type PotionKind = 'hp' | 'mp';

export interface PotionDef {
  id: string;
  name: string;
  nameTh: string;
  icon: string;
  kind: PotionKind;
  /** ปริมาณที่ฟื้น (หน่วยเดียวกับ HP/MP) */
  restore: number;
  /** ราคาต่อขวด (เหรียญ) */
  price: number;
}

export const POTIONS: Record<string, PotionDef> = {
  'potion-hp': {
    id: 'potion-hp',
    name: 'HP Potion',
    nameTh: 'ยาฟื้น HP',
    icon: '❤️',
    kind: 'hp',
    restore: 75,
    price: 40,
  },
  'potion-mp': {
    id: 'potion-mp',
    name: 'MP Potion',
    nameTh: 'ยาฟื้น MP',
    icon: '🔵',
    kind: 'mp',
    restore: 60,
    price: 40,
  },
};

/** รายการ id ยาทั้งหมด (เรียงตามที่จะโชว์ในร้าน/กระเป๋า) */
export const POTION_IDS: readonly string[] = ['potion-hp', 'potion-mp'];

export function getPotion(id: string): PotionDef | undefined {
  return POTIONS[id];
}
