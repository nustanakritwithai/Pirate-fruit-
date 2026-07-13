import { describe, expect, it } from 'vitest';
import { LEVEL_SYSTEM_CONFIG } from '../databook/config';
import { BOSS_LEVEL_REWARDS, SEA_GATES } from '../databook';
import {
  cumulativeExpToLevel,
  expRequiredForLevel,
  fishingExpReward,
  hasReachedSeaGate,
  isMaxLevel,
  levelFromCumulativeExp,
  statPointsFromLevelUps,
} from '../LevelFormulas';
import { getBossLevelReward, getSeaGate } from '../LevelRegistry';

describe('Levels databook', () => {
  it('uses blox fruits exp formula', () => {
    expect(expRequiredForLevel(1)).toBe(86);
    expect(expRequiredForLevel(100)).toBe(79_705);
  });

  it('matches wiki total exp to max level', () => {
    const total = cumulativeExpToLevel(LEVEL_SYSTEM_CONFIG.maxLevel);
    const diff = Math.abs(total - LEVEL_SYSTEM_CONFIG.totalExpToMaxLevel);
    expect(diff).toBeLessThan(2000);
  });

  it('defines sea gates', () => {
    expect(getSeaGate('second-sea')?.requiredLevel).toBe(700);
    expect(getSeaGate('third-sea')?.requiredLevel).toBe(1500);
    expect(SEA_GATES).toHaveLength(3);
  });

  it('grants 3 stat points per level', () => {
    expect(statPointsFromLevelUps(10)).toBe(30);
  });

  it('lists boss direct level rewards', () => {
    expect(getBossLevelReward('dough-king')?.levelsGranted).toBe(6);
    expect(BOSS_LEVEL_REWARDS.length).toBeGreaterThanOrEqual(10);
  });

  it('checks sea gate by level', () => {
    expect(hasReachedSeaGate(699, 'second-sea')).toBe(false);
    expect(hasReachedSeaGate(700, 'second-sea')).toBe(true);
    expect(hasReachedSeaGate(1500, 'third-sea')).toBe(true);
  });

  it('round-trips cumulative exp to level', () => {
    const exp = cumulativeExpToLevel(500);
    expect(levelFromCumulativeExp(exp)).toBe(500);
  });

  it('fishing gives 25% of current level exp requirement', () => {
    expect(fishingExpReward(100)).toBe(Math.floor(expRequiredForLevel(100) * 0.25));
  });

  it('detects max level', () => {
    expect(isMaxLevel(2800)).toBe(true);
    expect(isMaxLevel(2799)).toBe(false);
  });
});
