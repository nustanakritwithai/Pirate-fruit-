import type { StatsSystemConfig } from '../types';

/** ค่าคงที่หลักจาก Blox Fruits Wiki */
export const STATS_SYSTEM_CONFIG: StatsSystemConfig = {
  statPointsPerLevel: 3,
  maxPointsPerStat: 2800,
  maxStatsFullyMaxed: 3,
  maxPlayerLevel: 2800,
  masteryMaxLevel: 600,
  masteryMaxBonusStatPoints: 430,
  maxStatWithMasteryBonus: 3230,
  /** แต่ละแต้ม Sword/Gun/Fruit เพิ่มดาเมจ — คำนวณจาก 78.26x ที่ 2800 แต้ม */
  damagePerStatPoint: (78.26 - 1) / 2800,
  /** 2800 แต้ม ≈ 78.26x เทียบกับ 0 แต้ม */
  damageMultiplierAtMax: 78.26,
  healthPerDefensePoint: 5,
  energyPerMeleePoint: 5,
  manaPerManaPoint: 5,
  meleeDamagePerPoint: 0.5,
} as const;
