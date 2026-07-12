import { describe, expect, it } from 'vitest';
import {
  RewardContributionTracker,
  getLevelRewardMultiplier,
  grantEnemyRewards,
  type RewardSink,
} from '../RewardSystem';
import type { LoadoutCategory, RewardContribution } from '../ProgressionTypes';

class RecordingSink implements RewardSink {
  level = 1;
  playerExp = 0;
  coins = 0;
  mastery: { itemId: string; category: LoadoutCategory; amount: number }[] = [];

  addPlayerExp(amount: number): null {
    this.playerExp += amount;
    return null;
  }

  addMasteryExp(itemId: string, category: LoadoutCategory, amount: number): null {
    this.mastery.push({ itemId, category, amount });
    return null;
  }

  addCoins(amount: number): void {
    this.coins += amount;
  }
}

const contribution: RewardContribution = {
  enemyId: 'grunt',
  totalDamage: 95,
  highestDamageItemId: 'training-sword',
  highestDamageCategory: 'sword',
  lastHitItemId: 'basic-brawl',
  lastHitCategory: 'style',
  killed: true,
};

describe('RewardSystem', () => {
  it('collects the Phase 5 reward hook until death and preserves highest/last items', () => {
    const tracker = new RewardContributionTracker<object>();
    const enemy = {};
    expect(
      tracker.record(enemy, 'grunt', 60, false, {
        itemId: 'training-sword',
        category: 'sword',
      }),
    ).toBeNull();
    expect(
      tracker.record(enemy, 'grunt', 20, false, {
        itemId: 'basic-brawl',
        category: 'style',
      }),
    ).toBeNull();
    expect(
      tracker.record(enemy, 'grunt', 15, true, {
        itemId: 'basic-brawl',
        category: 'style',
      }),
    ).toEqual({
      enemyId: 'grunt',
      totalDamage: 95,
      highestDamageItemId: 'training-sword',
      highestDamageCategory: 'sword',
      lastHitItemId: 'basic-brawl',
      lastHitCategory: 'style',
      killed: true,
    });
  });

  it('applies level-difference brackets', () => {
    expect(getLevelRewardMultiplier(10, 5)).toBe(1);
    expect(getLevelRewardMultiplier(11, 5)).toBe(0.7);
    expect(getLevelRewardMultiplier(21, 5)).toBe(0.4);
    expect(getLevelRewardMultiplier(30, 5)).toBe(0.2);
  });

  it('splits mastery 70/30 between highest damage and last hit items', () => {
    const sink = new RecordingSink();
    const reward = grantEnemyRewards(
      sink,
      {
        id: 'grunt',
        level: 4,
        isBoss: false,
        reward: { playerExp: 55, masteryExp: 30, coins: 24 },
      },
      contribution,
    );
    expect(reward.mastery).toEqual([
      { itemId: 'training-sword', category: 'sword', amount: 21 },
      { itemId: 'basic-brawl', category: 'style', amount: 9 },
    ]);
    expect(sink.playerExp).toBe(55);
    expect(sink.coins).toBe(24);
  });

  it('gives all mastery to one item when it is both highest and last hit', () => {
    const sink = new RecordingSink();
    const sameItem = {
      ...contribution,
      lastHitItemId: 'training-sword',
      lastHitCategory: 'sword' as const,
    };
    const reward = grantEnemyRewards(
      sink,
      {
        id: 'crab',
        level: 2,
        isBoss: false,
        reward: { playerExp: 30, masteryExp: 18, coins: 12 },
      },
      sameItem,
    );
    expect(reward.mastery).toEqual([
      { itemId: 'training-sword', category: 'sword', amount: 18 },
    ]);
  });
});
