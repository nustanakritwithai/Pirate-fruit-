import type { MasterySystemConfig } from '../types';

/** ค่าคงที่หลักจาก Blox Fruits Wiki — Mastery */
export const MASTERY_SYSTEM_CONFIG: MasterySystemConfig = {
  maxMasteryLevel: 600,
  fishingRodMaxMastery: 100,
  masteryExpFormula: '⌈MasteryLvl^2.26 + 69⌉',
  masteryBonusStatFormula: '(Mastery/4) + [PlayerLvl × (Mastery/600) × 0.1]',
  maxItemStatBonusFormula: '150 + PlayerLvl × 0.1',
  totalMasteryExpToMax: 348_679_374,
  totalMasteryExpFishingRodToMax: 1_006_076,
  maxMasteryMultiplier: 2.7,
  maxMasteryBonusStatPoints: 430,
} as const;
