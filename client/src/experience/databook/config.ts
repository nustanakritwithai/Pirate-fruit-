import type { ExperienceSystemConfig } from '../types';

/** ค่าคงที่หลักจาก Blox Fruits Wiki — Experience */
export const EXPERIENCE_SYSTEM_CONFIG: ExperienceSystemConfig = {
  maxLevel: 2800,
  primaryExpFormula: 'floor(2 × level^2.3 + 84)',
  approximateExpFormula: '≈ 1.73 × level^1.726',
  totalExpToMaxLevel: 143_840_871_332,
  fishingExpPercent: 0.25,
  gravestoneBlessingChance: 0.49,
  shopBoostMultiplier: 2,
  deathRespawnBoostGraceSeconds: 5,
} as const;
