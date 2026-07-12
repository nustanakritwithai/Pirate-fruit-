import type { MasteryTitle } from '../types';

export const MASTERY_TITLES: readonly MasteryTitle[] = [
  {
    id: 'the-master',
    name: 'The Master',
    nameTh: 'The Master',
    requirement: 'Reach max mastery on any weapon category',
    requirementTh: 'Mastery สูงสุดของอาวุธ/ผลไม้/คันเบ็ดใดก็ได้',
  },
  {
    id: 'unbreakable-will',
    name: 'Unbreakable Will',
    nameTh: 'Unbreakable Will',
    requirement: 'Reach max mastery on any weapon category',
    requirementTh: 'Mastery สูงสุดของอาวุธ/ผลไม้/คันเบ็ดใดก็ได้',
  },
  {
    id: 'fist-of-death',
    name: 'Fist of Death',
    nameTh: 'Fist of Death',
    requirement: 'Reach max mastery on a fighting style',
    requirementTh: 'Mastery สูงสุดของท่าต่อสู้',
    category: 'fighting-style',
  },
  {
    id: 'god-blade',
    name: 'God Blade',
    nameTh: 'God Blade',
    requirement: 'Reach max mastery on a sword',
    requirementTh: 'Mastery สูงสุดของดาบ',
    category: 'sword',
  },
  {
    id: 'king-sniper',
    name: 'King Sniper',
    nameTh: 'King Sniper',
    requirement: 'Reach max mastery on a gun',
    requirementTh: 'Mastery สูงสุดของปืน',
    category: 'gun',
  },
  {
    id: 'beyond-the-sea',
    name: 'Beyond the Sea',
    nameTh: 'Beyond the Sea',
    requirement: 'Reach max mastery on a Blox Fruit',
    requirementTh: 'Mastery สูงสุดของผลไม้',
    category: 'fruit',
  },
] as const;
