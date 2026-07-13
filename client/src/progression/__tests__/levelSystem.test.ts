import { describe, expect, it } from 'vitest';
import { applyPlayerExp, getExpRequiredForLevel } from '../LevelSystem';
import { createDefaultProgressionState } from '../ProgressionSave';

describe('LevelSystem', () => {
  it('uses the Blox Fruits Wiki EXP curve floor(2·L^2.3 + 84)', () => {
    expect(getExpRequiredForLevel(1)).toBe(86);
    expect(getExpRequiredForLevel(2)).toBe(93);
    expect(getExpRequiredForLevel(5)).toBe(165);
    expect(getExpRequiredForLevel(10)).toBe(483);
    expect(getExpRequiredForLevel(20)).toBe(2049);
  });

  it('supports gaining several levels from one reward', () => {
    const player = createDefaultProgressionState().player;
    const result = applyPlayerExp(player, 1000);

    expect(result).toEqual({
      previousLevel: 1,
      newLevel: 7,
      levelsGained: 6,
      statPointsGained: 18,
      remainingExp: 208,
    });
    expect(player.statPoints).toBe(18);
  });

  it('ignores invalid EXP and stops at the configured cap (Lv 2800)', () => {
    const player = createDefaultProgressionState().player;
    expect(applyPlayerExp(player, Number.NaN).levelsGained).toBe(0);
    player.level = 2799;
    const result = applyPlayerExp(player, 1_000_000_000);
    expect(result.newLevel).toBe(2800);
    expect(result.remainingExp).toBe(0);
    expect(result.statPointsGained).toBe(3);
  });
});
