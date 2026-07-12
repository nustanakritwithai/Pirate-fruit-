import { describe, expect, it } from 'vitest';
import { STATS_SYSTEM_CONFIG } from '../databook/config';
import { STAT_DEFINITIONS } from '../databook/stats';
import { STAT_BUILD_PRESETS } from '../databook/builds';
import {
  damageStatMultiplier,
  isValidBloxBuild,
  masteryBonusStatPoints,
  masteryExpToLevelUp,
} from '../StatFormulas';
import { getBuildPreset, getStatByInternalId } from '../StatsRegistry';

describe('Stats databook', () => {
  it('defines all 5 Blox Fruits stats', () => {
    expect(STAT_DEFINITIONS).toHaveLength(5);
    expect(STAT_DEFINITIONS.map((s) => s.id).sort()).toEqual(
      ['defense', 'fruit', 'gun', 'melee', 'sword'].sort(),
    );
  });

  it('maps internal stat ids to blox ids', () => {
    expect(getStatByInternalId('combat')?.id).toBe('melee');
    expect(getStatByInternalId('fruitPower')?.id).toBe('fruit');
  });

  it('calculates damage multiplier at max stat', () => {
    const mult = damageStatMultiplier(STATS_SYSTEM_CONFIG.maxPointsPerStat);
    expect(mult).toBeCloseTo(STATS_SYSTEM_CONFIG.damageMultiplierAtMax, 1);
  });

  it('uses blox mastery exp formula', () => {
    expect(masteryExpToLevelUp(1)).toBe(70);
    expect(masteryExpToLevelUp(100)).toBeGreaterThan(1000);
  });

  it('caps mastery bonus stat points at 430', () => {
    const bonus = masteryBonusStatPoints(600, STATS_SYSTEM_CONFIG.maxPlayerLevel);
    expect(bonus).toBeLessThanOrEqual(STATS_SYSTEM_CONFIG.masteryMaxBonusStatPoints);
    expect(bonus).toBeGreaterThan(100);
  });

  it('validates max-level builds do not exceed 3 maxed stats', () => {
    for (const build of STAT_BUILD_PRESETS.filter((b) => b.tier === 'max-level')) {
      expect(isValidBloxBuild(build.allocation)).toBe(true);
    }
    expect(getBuildPreset('max-fruit-main')?.allocation.fruit).toBe(2800);
  });
});
