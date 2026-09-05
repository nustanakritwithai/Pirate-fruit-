import type { ExpMultiplierDefinition } from '../types';

/** ตัวคูณ EXP ที่พบในเกม */
export const EXP_MULTIPLIERS: readonly ExpMultiplierDefinition[] = [
  {
    id: '2x-exp-shop',
    name: '2x EXP Boost',
    nameTh: 'EXP 2 เท่า',
    multiplier: 2,
    stackable: false,
    description: 'จากร้านหรือโค้ด — ซ้อนกันเพิ่มแค่เวลา ไม่เพิ่มตัวคูณ',
  },
  {
    id: 'premium',
    name: 'Roblox Premium',
    nameTh: 'Premium',
    multiplier: 1.1,
    stackable: true,
    description: 'ได้ EXP เพิ่มจากเควส/ฆ่า',
  },
  {
    id: 'party-hat',
    name: 'Party Hat / 50b Party Hat',
    nameTh: 'หมุดปาร์ตี้',
    multiplier: 1.1,
    stackable: true,
    description: 'อุปกรณ์เสริม EXP',
  },
  {
    id: 'curse-of-thief',
    name: 'Curse Of The Thief',
    nameTh: 'คำสาปโจร',
    multiplier: 2.5,
    stackable: true,
    description: 'Enchantment บางชนิด',
  },
] as const;
