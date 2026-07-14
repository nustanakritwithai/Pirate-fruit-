import { STATS_SYSTEM_CONFIG } from '../stats/databook/config';
import { LEVEL_SYSTEM_CONFIG } from '../levels/databook/config';

/**
 * ค่าคงที่ Progression — สเกลเต็มตาม Blox Fruits Wiki
 * ดึงมาจาก databook อ้างอิง (stats/ + levels/) เพื่อให้เป็น single source of truth
 * เกมจริงจึงเดินตามข้อมูล wiki: Lv สูงสุด 2800, แต้มต่อสเตต 2800, ดาเมจสูงสุด ~78x
 */
export const PROGRESSION_CONFIG = {
  // ---------- Level / Stat points (wiki) ----------
  maxLevel: LEVEL_SYSTEM_CONFIG.maxLevel, // 2800
  statPointsPerLevel: LEVEL_SYSTEM_CONFIG.statPointsPerLevel, // 3
  maxStatPerCategory: STATS_SYSTEM_CONFIG.maxPointsPerStat, // 2800

  // ---------- Defense → HP, Melee → Energy (wiki) ----------
  baseHealth: 100,
  healthPerVitality: STATS_SYSTEM_CONFIG.healthPerDefensePoint, // +5 ต่อ Defense
  baseEnergy: 100,
  energyPerCombat: STATS_SYSTEM_CONFIG.energyPerMeleePoint, // +5 ต่อ Melee
  // ---------- Mana → MP (สเตต "พลังเวท" → พลังงานร่ายสกิล) ----------
  baseMana: 100,
  manaPerMana: STATS_SYSTEM_CONFIG.manaPerManaPoint, // +5 ต่อ พลังเวท

  // ---------- Damage per stat point (wiki: ~78.26x ที่ 2800 แต้ม) ----------
  damagePerStatPoint: STATS_SYSTEM_CONFIG.damagePerStatPoint, // (78.26-1)/2800

  // ---------- Mastery (wiki) ----------
  masteryMaxLevel: STATS_SYSTEM_CONFIG.masteryMaxLevel, // 600
  masteryHighestDamageShare: 0.7,

  // ---------- Reward scaling (คงเดิม — บาลานซ์รางวัลตามส่วนต่างเลเวล) ----------
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
