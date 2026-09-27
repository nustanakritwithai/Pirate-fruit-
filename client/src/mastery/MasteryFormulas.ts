import { MASTERY_SYSTEM_CONFIG } from './databook/config';
import type { MasteryItemCategory } from './types';
import { MASTERY_ITEM_CATEGORIES } from './databook/itemCategories';
import { MASTERY_MULTIPLIERS } from './databook/multipliers';

/**
 * Mastery EXP ที่ต้องใช้เพื่ออัป 1 เลเวล
 * สูตร Blox Fruits: ⌈MasteryLvl^2.26 + 69⌉
 */
export function masteryExpToLevelUp(masteryLevel: number): number {
  const lvl = Math.max(1, Math.floor(masteryLevel));
  return Math.ceil(lvl ** 2.26 + 69);
}

/** Mastery EXP สะสมถึงเลเวลเป้าหมาย */
export function cumulativeMasteryExpToLevel(targetLevel: number): number {
  const target = Math.max(1, Math.floor(targetLevel));
  let total = 0;
  for (let lvl = 1; lvl < target; lvl++) {
    total += masteryExpToLevelUp(lvl);
  }
  return total;
}

/**
 * แต้มสเตตัสโบนัสจาก Mastery
 * (Mastery/4) + [PlayerLvl × (Mastery/600) × 0.1]
 */
export function masteryBonusStatPoints(
  masteryLevel: number,
  playerLevel: number,
): number {
  const m = Math.max(0, Math.min(masteryLevel, MASTERY_SYSTEM_CONFIG.maxMasteryLevel));
  const p = Math.max(1, playerLevel);
  return Math.floor(m / 4 + p * (m / 600) * 0.1);
}

/** โบนัสสเตตัสไอเทมเมื่อ Mastery สูงสุด: 150 + PlayerLvl × 0.1 */
export function maxMasteryItemStatBonus(playerLevel: number): number {
  const p = Math.max(1, Math.floor(playerLevel));
  return Math.floor(150 + p * 0.1);
}

/** คูณ Mastery ที่ได้ด้วยตัวคูณที่เปิดใช้ */
export function applyMasteryMultipliers(
  baseMastery: number,
  multiplierIds: string[],
): number {
  let total = Math.max(0, baseMastery);
  for (const id of multiplierIds) {
    const m = MASTERY_MULTIPLIERS.find((x) => x.id === id);
    if (m?.stackable) {
      total *= m.multiplier;
    }
  }
  return Math.floor(total);
}

/** ตรวจว่า Mastery ถึงขั้นปลดสกิล */
export function canUnlockSkillAtMastery(
  currentMastery: number,
  requiredMastery: number,
): boolean {
  return currentMastery >= Math.max(0, Math.floor(requiredMastery));
}

/** เพดาน Mastery ตามประเภทไอเทม */
export function maxMasteryForCategory(category: MasteryItemCategory): number {
  const def = MASTERY_ITEM_CATEGORIES.find((c) => c.id === category);
  return def?.maxMastery ?? MASTERY_SYSTEM_CONFIG.maxMasteryLevel;
}

/** ตรวจว่า Mastery ถึง max ของไอเทม */
export function isMaxMastery(
  currentMastery: number,
  category: MasteryItemCategory,
): boolean {
  return currentMastery >= maxMasteryForCategory(category);
}
