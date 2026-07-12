export const PROGRESSION_CONFIG = {
  maxLevel: 100,
  statPointsPerLevel: 3,
  maxStatPerCategory: 100,

  baseHealth: 100,
  healthPerVitality: 8,

  baseEnergy: 100,
  energyPerCombat: 4,

  damagePerStatPoint: 0.012,
  masteryMaxLevel: 300,
  masteryHighestDamageShare: 0.7,

  lowLevelRewardPenaltyStart: 10,
  lowLevelRewardMinimumMultiplier: 0.2,
  rewardFullDifferenceMax: 5,
  rewardReducedDifferenceMax: 10,
  rewardLowDifferenceMax: 20,
  rewardReducedMultiplier: 0.7,
  rewardLowMultiplier: 0.4,
  bossMinimumRewardMultiplier: 0.5,
  coinMinimumRewardMultiplier: 0.5,

  autosaveIntervalMs: 3000,
} as const;
