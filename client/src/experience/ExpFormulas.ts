import { EXPERIENCE_SYSTEM_CONFIG } from './databook/config';

/**
 * EXP ที่ต้องใช้เพื่อเลเวลอัป (สูตรหลักจาก Levels wiki)
 * floor(2 × level^2.3 + 84)
 */
export function expRequiredForLevel(level: number): number {
  const lv = Math.max(1, Math.floor(level));
  return Math.floor(2 * lv ** 2.3 + 84);
}

/**
 * สูตรประมาณจาก Experience trivia
 * ≈ 1.73 × level^1.726
 */
export function approximateExpForLevel(level: number): number {
  const lv = Math.max(1, Math.floor(level));
  return Math.floor(1.73 * lv ** 1.726);
}

/** EXP สะสมถึงเลเวลเป้าหมาย */
export function cumulativeExpToLevel(targetLevel: number): number {
  const target = Math.max(1, Math.floor(targetLevel));
  let total = 0;
  for (let lv = 1; lv < target; lv++) {
    total += expRequiredForLevel(lv);
  }
  return total;
}

/** EXP จากตกปลาสำเร็จ — 25% ของ EXP เลเวลปัจจุบัน */
export function fishingExpReward(currentLevel: number): number {
  return Math.floor(
    expRequiredForLevel(currentLevel) * EXPERIENCE_SYSTEM_CONFIG.fishingExpPercent,
  );
}

/** ประมาณจำนวนครั้งตกปลาถึง max level */
export function fishingTripsToMaxLevel(): number {
  let trips = 0;
  let level = 1;
  let totalExp = 0;
  const target = EXPERIENCE_SYSTEM_CONFIG.totalExpToMaxLevel;
  while (totalExp < target && level < EXPERIENCE_SYSTEM_CONFIG.maxLevel) {
    const gain = fishingExpReward(level);
    if (gain <= 0) break;
    totalExp += gain;
    trips++;
    if (totalExp >= cumulativeExpToLevel(level + 1)) {
      level++;
    }
  }
  return trips;
}

/** คูณ EXP ด้วยตัวคูณที่ stack ได้ (ไม่รวม 2x shop ที่แยกจัดการ) */
export function applyStackableExpMultipliers(
  baseExp: number,
  multiplierIds: string[],
  multipliers: readonly { id: string; multiplier: number; stackable: boolean }[],
): number {
  let total = Math.max(0, baseExp);
  const shopBoost = multipliers.find((m) => m.id === '2x-exp-shop');
  const hasShopBoost = multiplierIds.includes('2x-exp-shop');

  for (const id of multiplierIds) {
    if (id === '2x-exp-shop') continue;
    const m = multipliers.find((x) => x.id === id);
    if (m?.stackable) {
      total *= m.multiplier;
    }
  }
  if (hasShopBoost && shopBoost) {
    total *= shopBoost.multiplier;
  }
  return Math.floor(total);
}

/** ตรวจว่าได้ EXP จาก Gravestone blessing หรือไม่ (ใช้ chance) */
export function rollGravestoneBlessing(random = Math.random()): boolean {
  return random < EXPERIENCE_SYSTEM_CONFIG.gravestoneBlessingChance;
}

/** EXP ที่ได้จากศัตรูเมื่อเลเวลต่างกัน (prototype — ศัตรูเลเวลสูงกว่าให้มากขึ้น) */
export function combatExpByLevelGap(
  baseExp: number,
  playerLevel: number,
  enemyLevel: number,
): number {
  const gap = enemyLevel - playerLevel;
  if (gap <= 0) return Math.max(1, Math.floor(baseExp * 0.5));
  if (gap <= 5) return baseExp;
  if (gap <= 10) return Math.floor(baseExp * 1.5);
  return Math.floor(baseExp * 2);
}
