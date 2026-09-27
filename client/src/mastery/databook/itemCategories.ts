import type { MasteryItemCategoryDefinition } from '../types';
import { MASTERY_SYSTEM_CONFIG } from './config';

export const MASTERY_ITEM_CATEGORIES: readonly MasteryItemCategoryDefinition[] = [
  {
    id: 'fighting-style',
    name: 'Fighting Style',
    nameTh: 'ท่าต่อสู้',
    maxMastery: MASTERY_SYSTEM_CONFIG.maxMasteryLevel,
    unlocksSkills: true,
  },
  {
    id: 'fruit',
    name: 'Blox Fruit',
    nameTh: 'ผลไม้',
    maxMastery: MASTERY_SYSTEM_CONFIG.maxMasteryLevel,
    unlocksSkills: true,
  },
  {
    id: 'sword',
    name: 'Sword',
    nameTh: 'ดาบ',
    maxMastery: MASTERY_SYSTEM_CONFIG.maxMasteryLevel,
    unlocksSkills: true,
  },
  {
    id: 'gun',
    name: 'Gun',
    nameTh: 'ปืน',
    maxMastery: MASTERY_SYSTEM_CONFIG.maxMasteryLevel,
    unlocksSkills: true,
  },
  {
    id: 'fishing-rod',
    name: 'Fishing Rod',
    nameTh: 'คันเบ็ด',
    maxMastery: MASTERY_SYSTEM_CONFIG.fishingRodMaxMastery,
    unlocksSkills: true,
  },
] as const;
