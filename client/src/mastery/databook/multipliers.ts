import type { MasteryMultiplierDefinition } from '../types';

/** ตัวคูณ Mastery ที่พบในเกม */
export const MASTERY_MULTIPLIERS: readonly MasteryMultiplierDefinition[] = [
  {
    id: '2x-mastery-gamepass',
    name: '2x Mastery Gamepass',
    nameTh: 'Gamepass Mastery 2 เท่า',
    multiplier: 2,
    stackable: true,
    description: 'Doubles mastery gained',
  },
  {
    id: 'party-hat',
    name: 'Party Hat / 50b Party Hat',
    nameTh: 'หมุดปาร์ตี้',
    multiplier: 1.1,
    stackable: true,
    description: 'Accessory mastery boost',
  },
  {
    id: 'efficient-lv4',
    name: 'Efficient Enchantment Lv4',
    nameTh: 'Efficient Enchant Lv4',
    multiplier: 1.227,
    stackable: true,
    description: 'On sword or gun — part of max x2.70 stack',
  },
] as const;
