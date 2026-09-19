import type { HealthRegenAccessory } from '../types';

/** อุปกรณ์ที่เพิ่มความเร็วฟื้น HP จาก Health wiki */
export const HEALTH_REGEN_ACCESSORIES: readonly HealthRegenAccessory[] = [
  {
    id: 'leviathan-crown',
    name: 'Leviathan Crown',
    nameTh: 'Leviathan Crown',
    description: 'Increases health regeneration speed',
  },
  {
    id: 'pilot-helmet',
    name: 'Pilot Helmet',
    nameTh: 'Pilot Helmet',
    description: 'Increases health regeneration speed',
  },
  {
    id: 'kitsune-ribbon',
    name: 'Kitsune Ribbon',
    nameTh: 'Kitsune Ribbon',
    description: 'Increases health regeneration speed',
  },
  {
    id: 'lei',
    name: 'Lei',
    nameTh: 'Lei',
    description: 'Increases health regeneration speed',
  },
  {
    id: 'feathered-visage',
    name: 'Feathered Visage',
    nameTh: 'Feathered Visage',
    description: 'Increases health regeneration speed',
  },
] as const;
