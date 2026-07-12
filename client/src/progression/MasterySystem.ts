import { PROGRESSION_CONFIG } from './ProgressionData';
import type {
  LoadoutCategory,
  MasteryEntry,
  MasteryLevelUpResult,
  SkillRequirement,
} from './ProgressionTypes';

export function getMasteryExpRequired(level: number): number {
  const safeLevel = Math.max(1, Math.floor(Number.isFinite(level) ? level : 1));
  return Math.floor(40 + safeLevel * 18 + safeLevel * safeLevel * 1.6);
}

export function createMasteryEntry(itemId: string, category: LoadoutCategory): MasteryEntry {
  return { itemId, category, level: 1, exp: 0 };
}

export function applyMasteryExp(entry: MasteryEntry, amount: number): MasteryLevelUpResult {
  const previousLevel = entry.level;
  if (!Number.isFinite(amount) || amount <= 0 || entry.level >= PROGRESSION_CONFIG.masteryMaxLevel) {
    return {
      itemId: entry.itemId,
      previousLevel,
      newLevel: entry.level,
      levelsGained: 0,
      remainingExp: entry.exp,
    };
  }

  entry.exp += Math.floor(amount);
  let levelsGained = 0;
  while (entry.level < PROGRESSION_CONFIG.masteryMaxLevel) {
    const required = getMasteryExpRequired(entry.level);
    if (entry.exp < required) break;
    entry.exp -= required;
    entry.level++;
    levelsGained++;
  }
  if (entry.level >= PROGRESSION_CONFIG.masteryMaxLevel) entry.exp = 0;

  return {
    itemId: entry.itemId,
    previousLevel,
    newLevel: entry.level,
    levelsGained,
    remainingExp: entry.exp,
  };
}

export function canUseSkill(masteryLevel: number, skill: SkillRequirement): boolean {
  return masteryLevel >= Math.max(0, skill.masteryRequired);
}
