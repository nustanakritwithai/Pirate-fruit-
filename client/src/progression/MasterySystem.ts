import { PROGRESSION_CONFIG } from './ProgressionData';
import { applyMasteryExp as applySharedMasteryExp, getMasteryExpRequired as getSharedMasteryExpRequired } from '@pirate-fruit/shared';
import type {
  LoadoutCategory,
  MasteryEntry,
  MasteryLevelUpResult,
  SkillRequirement,
} from './ProgressionTypes';

export function getMasteryExpRequired(level: number): number {
  return getSharedMasteryExpRequired(level);
}

export function createMasteryEntry(itemId: string, category: LoadoutCategory): MasteryEntry {
  return { itemId, category, level: 1, exp: 0 };
}

export function applyMasteryExp(entry: MasteryEntry, amount: number): MasteryLevelUpResult {
  return applySharedMasteryExp(entry, amount, PROGRESSION_CONFIG.masteryMaxLevel);
}

export function canUseSkill(masteryLevel: number, skill: SkillRequirement): boolean {
  return masteryLevel >= Math.max(0, skill.masteryRequired);
}
