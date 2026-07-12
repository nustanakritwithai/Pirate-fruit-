import type { ExpMultiplierDefinition } from '../types';

/** ตัวคูณ EXP ที่พบในเกม (อ้างอิง wiki) */
export const EXP_MULTIPLIERS: readonly ExpMultiplierDefinition[] = [
  {
    id: '2x-exp-shop',
    name: '2x EXP (Shop)',
    nameTh: 'EXP 2 เท่า (ร้าน)',
    multiplier: 2,
    description: 'บูสต์จากร้านค้า',
  },
  {
    id: 'premium',
    name: 'Roblox Premium',
    nameTh: 'Premium',
    multiplier: 1.1,
    description: 'Premium ได้ EXP เพิ่มจากเควส/ฆ่า',
  },
  {
    id: 'party-hat',
    name: 'Party Hat / 50b Party Hat',
    nameTh: 'หมวกปาร์ตี้',
    multiplier: 1.1,
    description: 'อุปกรณ์เสริม EXP',
  },
  {
    id: 'curse-of-thief',
    name: 'Curse Of The Thief (Enchantment)',
    nameTh: 'คำสาปโจร (Enchant)',
    multiplier: 2.5,
    description: 'Enchantment บางชนิดคูณ EXP',
  },
] as const;
