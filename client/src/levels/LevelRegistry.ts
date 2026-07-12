import type { BossLevelReward, SeaGateDefinition } from './types';
import {
  BOSS_LEVEL_REWARDS,
  BOUNTY_LEVEL_RULES,
  EXP_MULTIPLIERS,
  EXP_SOURCES,
  LEVEL_CAP_HISTORY,
  LEVEL_SYSTEM_CONFIG,
  SEA_GATES,
} from './databook';

export {
  BOSS_LEVEL_REWARDS,
  BOUNTY_LEVEL_RULES,
  EXP_MULTIPLIERS,
  EXP_SOURCES,
  LEVEL_CAP_HISTORY,
  LEVEL_SYSTEM_CONFIG,
  SEA_GATES,
};

export function getSeaGate(id: string): SeaGateDefinition | undefined {
  return SEA_GATES.find((g) => g.id === id);
}

export function getBossLevelReward(id: string): BossLevelReward | undefined {
  return BOSS_LEVEL_REWARDS.find((b) => b.id === id);
}

export function listSeaGatesForLevel(level: number): SeaGateDefinition[] {
  return SEA_GATES.filter((g) => level >= g.requiredLevel);
}

export * from './LevelFormulas';
