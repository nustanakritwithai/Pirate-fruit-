import { STATS_SYSTEM_CONFIG } from './databook/config';

/**
 * EXP ที่ต้องใช้เพื่ออัป Mastery 1 เลเวล
 * สูตร Blox Fruits: ⌈MasteryLvl^2.26 + 69⌉
 */
export function masteryExpToLevelUp(masteryLevel: number): number {
  const lvl = Math.max(1, Math.floor(masteryLevel));
  return Math.ceil(lvl ** 2.26 + 69);
}

/**
 * แต้มสเตตัสโบนัสจาก Mastery ของอาวุธ/ผลไม้
 * สูตร: (Mastery/4) + [PlayerLvl × (Mastery/600) × 0.1]
 */
export function masteryBonusStatPoints(masteryLevel: number, playerLevel: number): number {
  const m = Math.max(0, Math.min(masteryLevel, STATS_SYSTEM_CONFIG.masteryMaxLevel));
  const p = Math.max(1, playerLevel);
  return Math.floor(m / 4 + p * (m / 600) * 0.1);
}

/** ตัวคูณดาเมจ Sword/Gun/Fruit จากแต้มสเตตัส (Blox Fruits) */
export function damageStatMultiplier(statPoints: number): number {
  const pts = Math.max(0, Math.min(statPoints, STATS_SYSTEM_CONFIG.maxStatWithMasteryBonus));
  return 1 + pts * STATS_SYSTEM_CONFIG.damagePerStatPoint;
}

/** HP จาก Defense */
export function defenseBonusHealth(defensePoints: number, baseHealth = 0): number {
  const pts = Math.max(0, defensePoints);
  return baseHealth + pts * STATS_SYSTEM_CONFIG.healthPerDefensePoint;
}

/** Energy โบนัสจาก Melee */
export function meleeBonusEnergy(meleePoints: number, baseEnergy = 0): number {
  const pts = Math.max(0, meleePoints);
  return baseEnergy + pts * STATS_SYSTEM_CONFIG.energyPerMeleePoint;
}

/** แต้มสเตตัสที่ได้เมื่อเลเวลอัป */
export function statPointsFromLevelUps(levelsGained: number): number {
  return levelsGained * STATS_SYSTEM_CONFIG.statPointsPerLevel;
}

/** ตรวจว่าลงแต้มเกิน cap ต่อสเตตัสหรือไม่ */
export function isWithinStatCap(points: number): boolean {
  return points >= 0 && points <= STATS_SYSTEM_CONFIG.maxPointsPerStat;
}

/** นับจำนวนสเตตัสที่ max (2800) */
export function countMaxedStats(allocation: Record<string, number>): number {
  return Object.values(allocation).filter((v) => v >= STATS_SYSTEM_CONFIG.maxPointsPerStat).length;
}

/** ตรวจบิลด์ว่าไม่ max เกิน 3 สเตตัส (กฎ Blox Fruits) */
export function isValidBloxBuild(allocation: Record<string, number>): boolean {
  return countMaxedStats(allocation) <= STATS_SYSTEM_CONFIG.maxStatsFullyMaxed;
}
