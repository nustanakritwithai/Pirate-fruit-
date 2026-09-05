import { describe, expect, it } from 'vitest';
import { EXP_BOOST_PRODUCTS, EXP_MILESTONES, EXP_SOURCES, EXPERIENCE_SYSTEM_CONFIG } from '../databook';
import {
  approximateExpForLevel,
  applyStackableExpMultipliers,
  combatExpByLevelGap,
  cumulativeExpToLevel,
  expRequiredForLevel,
  fishingExpReward,
  rollGravestoneBlessing,
} from '../ExpFormulas';
import { getExpBoostProduct, getExpMilestone, getExpSource } from '../ExperienceRegistry';
import { EXP_MULTIPLIERS } from '../databook/multipliers';

describe('Experience databook', () => {
  it('defines exp sources from wiki', () => {
    expect(EXP_SOURCES.length).toBeGreaterThanOrEqual(7);
    expect(getExpSource('fishing')?.kind).toBe('fishing');
    expect(getExpSource('praying-gravestone')?.notes).toContain('49%');
  });

  it('lists 2x exp shop products', () => {
    expect(EXP_BOOST_PRODUCTS).toHaveLength(5);
    expect(getExpBoostProduct('boost-24h')?.robux).toBe(1499);
  });

  it('uses primary exp formula', () => {
    expect(expRequiredForLevel(1)).toBe(86);
    expect(expRequiredForLevel(100)).toBe(79_705);
  });

  it('provides approximate formula from trivia', () => {
    expect(approximateExpForLevel(100)).toBeGreaterThan(0);
    expect(approximateExpForLevel(100)).toBeLessThan(expRequiredForLevel(100));
  });

  it('matches total exp milestone', () => {
    const total = cumulativeExpToLevel(EXPERIENCE_SYSTEM_CONFIG.maxLevel);
    expect(Math.abs(total - EXPERIENCE_SYSTEM_CONFIG.totalExpToMaxLevel)).toBeLessThan(2000);
    expect(getExpMilestone('max-level')?.cumulativeExp).toBe(143_840_871_332);
  });

  it('fishing gives 25% of level exp', () => {
    expect(fishingExpReward(50)).toBe(Math.floor(expRequiredForLevel(50) * 0.25));
  });

  it('applies stackable multipliers with 2x shop', () => {
    const base = 1000;
    const result = applyStackableExpMultipliers(
      base,
      ['premium', '2x-exp-shop'],
      EXP_MULTIPLIERS,
    );
    expect(result).toBe(Math.floor(base * 1.1 * 2));
  });

  it('gravestone blessing uses 49% chance', () => {
    expect(rollGravestoneBlessing(0.48)).toBe(true);
    expect(rollGravestoneBlessing(0.5)).toBe(false);
  });

  it('scales combat exp by enemy level gap', () => {
    expect(combatExpByLevelGap(100, 50, 40)).toBe(50);
    expect(combatExpByLevelGap(100, 50, 55)).toBe(100);
    expect(combatExpByLevelGap(100, 50, 65)).toBe(200);
  });

  it('defines sea exp milestones', () => {
    expect(EXP_MILESTONES.find((m) => m.id === 'second-sea')?.targetLevel).toBe(700);
  });
});
