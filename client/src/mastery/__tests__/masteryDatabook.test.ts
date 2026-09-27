import { describe, expect, it } from 'vitest';
import {
  MASTERY_ITEM_CATEGORIES,
  MASTERY_SYSTEM_CONFIG,
  MASTERY_TITLES,
} from '../databook';
import {
  applyMasteryMultipliers,
  canUnlockSkillAtMastery,
  cumulativeMasteryExpToLevel,
  isMaxMastery,
  masteryBonusStatPoints,
  masteryExpToLevelUp,
  maxMasteryForCategory,
  maxMasteryItemStatBonus,
} from '../MasteryFormulas';
import {
  getBossMasteryReward,
  getMasteryItemCategory,
  listMasteryGrindTipsBySea,
} from '../MasteryRegistry';

describe('Mastery databook', () => {
  it('defines mastery config from wiki', () => {
    expect(MASTERY_SYSTEM_CONFIG.maxMasteryLevel).toBe(600);
    expect(MASTERY_SYSTEM_CONFIG.fishingRodMaxMastery).toBe(100);
    expect(MASTERY_SYSTEM_CONFIG.maxMasteryMultiplier).toBe(2.7);
  });

  it('uses mastery exp formula', () => {
    expect(masteryExpToLevelUp(1)).toBe(70);
    expect(masteryExpToLevelUp(100)).toBeGreaterThan(1000);
  });

  it('matches wiki cumulative exp totals within tolerance', () => {
    const to600 = cumulativeMasteryExpToLevel(600);
    expect(Math.abs(to600 - MASTERY_SYSTEM_CONFIG.totalMasteryExpToMax)).toBeLessThan(500);
    const to100 = cumulativeMasteryExpToLevel(100);
    expect(Math.abs(to100 - MASTERY_SYSTEM_CONFIG.totalMasteryExpFishingRodToMax)).toBeLessThan(
      100,
    );
  });

  it('calculates mastery bonus stat points', () => {
    expect(masteryBonusStatPoints(500, 2300)).toBe(316);
    expect(masteryBonusStatPoints(600, 2800)).toBe(430);
  });

  it('calculates max mastery item stat bonus', () => {
    expect(maxMasteryItemStatBonus(2800)).toBe(430);
  });

  it('defines item categories and caps', () => {
    expect(MASTERY_ITEM_CATEGORIES).toHaveLength(5);
    expect(maxMasteryForCategory('fishing-rod')).toBe(100);
    expect(getMasteryItemCategory('fruit')?.maxMastery).toBe(600);
    expect(isMaxMastery(600, 'sword')).toBe(true);
  });

  it('applies mastery multipliers toward x2.70 cap', () => {
    const base = 1000;
    const boosted = applyMasteryMultipliers(base, [
      '2x-mastery-gamepass',
      'party-hat',
      'efficient-lv4',
    ]);
    expect(boosted).toBe(Math.floor(base * 2 * 1.1 * 1.227));
  });

  it('lists mastery titles and boss rewards', () => {
    expect(MASTERY_TITLES.length).toBeGreaterThanOrEqual(6);
    expect(getBossMasteryReward('cake-queen')?.approximateMastery).toBe(2_200_000);
    expect(canUnlockSkillAtMastery(100, 100)).toBe(true);
  });

  it('provides grind tips by sea', () => {
    expect(listMasteryGrindTipsBySea('third').length).toBeGreaterThanOrEqual(2);
  });
});
