import type { LevelSystemConfig } from '../types';
import { PVP_UNLOCK_LEVEL } from '@pirate-fruit/shared';

/** ค่าคงที่หลักจาก Blox Fruits Wiki — Levels / Experience */
export const LEVEL_SYSTEM_CONFIG: LevelSystemConfig = {
  maxLevel: 2800,
  statPointsPerLevel: 3,
  maxStatPointsEqualsMaxLevel: true,
  totalExpToMaxLevel: 143_840_871_332,
  expFormulaDescription: 'EXP to level up = floor(2 × currentLevel^2.3 + 84)',
  pvpUnlockLevel: PVP_UNLOCK_LEVEL,
  pvpReenableMinutesAfterDeath: 15,
} as const;
