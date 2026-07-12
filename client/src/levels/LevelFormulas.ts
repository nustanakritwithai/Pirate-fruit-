import { LEVEL_SYSTEM_CONFIG } from './databook/config';

/**
 * EXP ที่ต้องใช้เพื่อเลเวลอัปจากเลเวลปัจจุบัน
 * สูตร Blox Fruits: floor(2 × level^2.3 + 84)
 */
export function expRequiredForLevel(level: number): number {
  const lv = Math.max(1, Math.floor(level));
  return Math.floor(2 * lv ** 2.3 + 84);
}

/** EXP สะสมทั้งหมดเพื่อไปถึงเลเวลเป้าหมาย (ไม่รวมเลเวลเป้าหมาย) */
export function cumulativeExpToLevel(targetLevel: number): number {
  const target = Math.max(1, Math.floor(targetLevel));
  let total = 0;
  for (let lv = 1; lv < target; lv++) {
    total += expRequiredForLevel(lv);
  }
  return total;
}

/** แต้มสเตตัสที่ได้จากการเลเวลอัป */
export function statPointsFromLevelUps(levelsGained: number): number {
  return Math.max(0, Math.floor(levelsGained)) * LEVEL_SYSTEM_CONFIG.statPointsPerLevel;
}

/** แต้มสเตตัสสูงสุดที่ลงได้ต่อหมวด (เท่ากับ max level) */
export function maxAllocatableStatPoints(): number {
  return LEVEL_SYSTEM_CONFIG.maxLevel;
}

/** ตรวจว่าถึงเลเวลสูงสุดแล้ว */
export function isMaxLevel(level: number): boolean {
  return Math.floor(level) >= LEVEL_SYSTEM_CONFIG.maxLevel;
}

/** EXP จากตกปลา — 25% ของ EXP เลเวลปัจจุบัน */
export function fishingExpReward(currentLevel: number): number {
  return Math.floor(expRequiredForLevel(currentLevel) * 0.25);
}

/** คำนวณเลเวลจาก EXP สะสม (ประมาณ) */
export function levelFromCumulativeExp(totalExp: number): number {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalExp));
  while (level < LEVEL_SYSTEM_CONFIG.maxLevel) {
    const need = expRequiredForLevel(level);
    if (remaining < need) break;
    remaining -= need;
    level++;
  }
  return level;
}

/** เปอร์เซ็นต์ความคืบหน้าไปเลเวลถัดไป */
export function levelProgress(expInCurrentLevel: number, currentLevel: number): number {
  const need = expRequiredForLevel(currentLevel);
  if (need <= 0) return 1;
  return Math.min(1, Math.max(0, expInCurrentLevel / need));
}

/** ตรวจว่าเลเวลผ่านเกณฑ์ Sea */
export function hasReachedSeaGate(level: number, gateId: 'second-sea' | 'third-sea'): boolean {
  const required = gateId === 'second-sea' ? 700 : 1500;
  return Math.floor(level) >= required;
}
