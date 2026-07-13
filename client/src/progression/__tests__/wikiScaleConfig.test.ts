import { describe, expect, it } from 'vitest';
import { PROGRESSION_CONFIG } from '../ProgressionData';
import { STATS_SYSTEM_CONFIG } from '../../stats/databook/config';
import { LEVEL_SYSTEM_CONFIG } from '../../levels/databook/config';
import { getMaxHp, getMaxEnergy, getStatDamageMultiplier } from '../StatSystem';
import { createDefaultProgressionState } from '../ProgressionSave';

describe('Progression uses full Blox Fruits Wiki scale', () => {
  it('sources level/stat caps from the wiki databooks', () => {
    expect(PROGRESSION_CONFIG.maxLevel).toBe(LEVEL_SYSTEM_CONFIG.maxLevel);
    expect(PROGRESSION_CONFIG.maxLevel).toBe(2800);
    expect(PROGRESSION_CONFIG.maxStatPerCategory).toBe(STATS_SYSTEM_CONFIG.maxPointsPerStat);
    expect(PROGRESSION_CONFIG.maxStatPerCategory).toBe(2800);
    expect(PROGRESSION_CONFIG.statPointsPerLevel).toBe(3);
    expect(PROGRESSION_CONFIG.masteryMaxLevel).toBe(STATS_SYSTEM_CONFIG.masteryMaxLevel);
  });

  it('uses wiki per-point effects (HP+5/Defense, Energy+5/Melee, damage 78x at cap)', () => {
    expect(PROGRESSION_CONFIG.healthPerVitality).toBe(STATS_SYSTEM_CONFIG.healthPerDefensePoint);
    expect(PROGRESSION_CONFIG.energyPerCombat).toBe(STATS_SYSTEM_CONFIG.energyPerMeleePoint);
    expect(PROGRESSION_CONFIG.damagePerStatPoint).toBe(STATS_SYSTEM_CONFIG.damagePerStatPoint);
  });

  it('reaches the wiki ~78x damage multiplier when a damage stat is maxed', () => {
    const stats = createDefaultProgressionState().player.stats;
    stats.fruitPower = STATS_SYSTEM_CONFIG.maxPointsPerStat;
    expect(getStatDamageMultiplier(stats, 'fruit')).toBeCloseTo(
      STATS_SYSTEM_CONFIG.damageMultiplierAtMax,
      1,
    );
  });

  it('scales HP/Energy per wiki at a maxed Defense/Melee build', () => {
    const stats = createDefaultProgressionState().player.stats;
    stats.vitality = STATS_SYSTEM_CONFIG.maxPointsPerStat; // Defense
    stats.combat = STATS_SYSTEM_CONFIG.maxPointsPerStat; // Melee
    // base 100 + (2800-1) * 5
    expect(getMaxHp(stats)).toBe(100 + (2800 - 1) * 5);
    expect(getMaxEnergy(stats)).toBe(100 + (2800 - 1) * 5);
  });
});
