import type {
  BossMasteryReward,
  MasteryGrindTip,
  MasteryItemCategory,
  MasteryItemCategoryDefinition,
  MasteryMultiplierDefinition,
  MasterySourceDefinition,
  MasteryTitle,
} from './types';
import {
  BOSS_MASTERY_REWARDS,
  MASTERY_CAPACITY_HISTORY,
  MASTERY_GRIND_TIPS,
  MASTERY_ITEM_CATEGORIES,
  MASTERY_MULTIPLIERS,
  MASTERY_NOTES,
  MASTERY_SOURCES,
  MASTERY_SYSTEM_CONFIG,
  MASTERY_TITLES,
} from './databook';

export {
  BOSS_MASTERY_REWARDS,
  MASTERY_CAPACITY_HISTORY,
  MASTERY_GRIND_TIPS,
  MASTERY_ITEM_CATEGORIES,
  MASTERY_MULTIPLIERS,
  MASTERY_NOTES,
  MASTERY_SOURCES,
  MASTERY_SYSTEM_CONFIG,
  MASTERY_TITLES,
};

export function getMasteryItemCategory(
  id: MasteryItemCategory,
): MasteryItemCategoryDefinition | undefined {
  return MASTERY_ITEM_CATEGORIES.find((c) => c.id === id);
}

export function getMasterySource(id: string): MasterySourceDefinition | undefined {
  return MASTERY_SOURCES.find((s) => s.id === id);
}

export function getMasteryMultiplier(id: string): MasteryMultiplierDefinition | undefined {
  return MASTERY_MULTIPLIERS.find((m) => m.id === id);
}

export function getMasteryTitle(id: string): MasteryTitle | undefined {
  return MASTERY_TITLES.find((t) => t.id === id);
}

export function getBossMasteryReward(id: string): BossMasteryReward | undefined {
  return BOSS_MASTERY_REWARDS.find((b) => b.id === id);
}

export function listMasteryGrindTipsBySea(
  sea: MasteryGrindTip['sea'],
): MasteryGrindTip[] {
  return MASTERY_GRIND_TIPS.filter((t) => t.sea === sea);
}

export function listMasteryTitlesForCategory(
  category: MasteryItemCategory,
): MasteryTitle[] {
  return MASTERY_TITLES.filter((t) => !t.category || t.category === category);
}

export * from './MasteryFormulas';
