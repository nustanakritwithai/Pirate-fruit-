import { describe, expect, it } from 'vitest';
import { applyPlayerExp, getExpRequiredForLevel } from '../LevelSystem';
import { createDefaultProgressionState } from '../ProgressionSave';

describe('LevelSystem', () => {
  it('uses the prototype EXP curve', () => {
    expect(getExpRequiredForLevel(1)).toBe(119);
    expect(getExpRequiredForLevel(2)).toBe(166);
    expect(getExpRequiredForLevel(5)).toBe(355);
    expect(getExpRequiredForLevel(10)).toBe(830);
    expect(getExpRequiredForLevel(20)).toBe(2380);
  });

  it('supports gaining several levels from one reward', () => {
    const player = createDefaultProgressionState().player;
    const result = applyPlayerExp(player, 1000);

    expect(result).toEqual({
      previousLevel: 1,
      newLevel: 5,
      levelsGained: 4,
      statPointsGained: 12,
      remainingExp: 210,
    });
    expect(player.statPoints).toBe(12);
  });

  it('ignores invalid EXP and stops at the configured cap', () => {
    const player = createDefaultProgressionState().player;
    expect(applyPlayerExp(player, Number.NaN).levelsGained).toBe(0);
    player.level = 99;
    const result = applyPlayerExp(player, 999999);
    expect(result.newLevel).toBe(100);
    expect(result.remainingExp).toBe(0);
    expect(result.statPointsGained).toBe(3);
  });
});
