import type { BloxStatId, InternalStatId, StatBuildPreset, StatBuildTier, StatDefinition } from './types';
import {
  BUILD_BY_ID,
  BLOX_TO_INTERNAL,
  INTERNAL_TO_BLOX,
  STAT_BUILD_PRESETS,
  STAT_DEFINITIONS,
  STAT_BY_ID,
  STAT_REFUND_SOURCES,
  STATS_SYSTEM_CONFIG,
} from './databook';
export {
  BUILD_BY_ID,
  BLOX_TO_INTERNAL,
  INTERNAL_TO_BLOX,
  STAT_BUILD_PRESETS,
  STAT_DEFINITIONS,
  STAT_BY_ID,
  STAT_REFUND_SOURCES,
  STATS_SYSTEM_CONFIG,
};

export function getStatDefinition(id: BloxStatId): StatDefinition {
  return STAT_BY_ID[id];
}

export function getStatByInternalId(internalId: InternalStatId): StatDefinition | undefined {
  const bloxId = INTERNAL_TO_BLOX[internalId];
  return bloxId ? STAT_BY_ID[bloxId] : undefined;
}

export function listBuildPresets(tier?: StatBuildTier): StatBuildPreset[] {
  return tier ? STAT_BUILD_PRESETS.filter((b) => b.tier === tier) : [...STAT_BUILD_PRESETS];
}

export function getBuildPreset(id: string): StatBuildPreset | undefined {
  return BUILD_BY_ID[id];
}

export * from './StatFormulas';
