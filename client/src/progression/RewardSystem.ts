import { PROGRESSION_CONFIG } from './ProgressionData';
import type { CombatRewardSource } from '../combat/CombatData';
import type {
  GrantedReward,
  ItemMasteryReward,
  LoadoutCategory,
  RewardContribution,
  RewardEnemy,
} from './ProgressionTypes';

export interface RewardSink {
  readonly level: number;
  addPlayerExp(amount: number, source?: string): unknown;
  addMasteryExp(itemId: string, category: LoadoutCategory, amount: number): unknown;
  addCoins(amount: number, source?: string): void;
}

interface TrackedItemContribution extends CombatRewardSource {
  damage: number;
  lastHitAt: number;
}

interface TrackedEnemyContribution {
  totalDamage: number;
  items: Map<string, TrackedItemContribution>;
  lastHitItemId: string | null;
}

/**
 * Adapter ของ onRewardContribution จาก Phase 5 v2
 * เก็บข้อมูลระหว่างที่ตี แต่คืน RewardContribution เฉพาะตอน killed=true เท่านั้น
 */
export class RewardContributionTracker<TEnemy extends object> {
  private readonly tracked = new WeakMap<TEnemy, TrackedEnemyContribution>();

  record(
    enemy: TEnemy,
    enemyId: string,
    damage: number,
    killed: boolean,
    source?: CombatRewardSource,
  ): RewardContribution | null {
    let contribution = this.tracked.get(enemy);
    if (!contribution) {
      contribution = { totalDamage: 0, items: new Map(), lastHitItemId: null };
      this.tracked.set(enemy, contribution);
    }

    const actualDamage = Number.isFinite(damage) ? Math.max(0, damage) : 0;
    contribution.totalDamage += actualDamage;
    if (source && actualDamage > 0) {
      const item = contribution.items.get(source.itemId) ?? {
        ...source,
        damage: 0,
        lastHitAt: 0,
      };
      item.damage += actualDamage;
      item.lastHitAt = Date.now();
      contribution.items.set(source.itemId, item);
      contribution.lastHitItemId = source.itemId;
    }

    if (!killed) return null;
    this.tracked.delete(enemy);
    const entries = [...contribution.items.values()];
    const highest = entries.reduce<TrackedItemContribution | null>(
      (best, item) => (!best || item.damage > best.damage ? item : best),
      null,
    );
    const last = contribution.lastHitItemId
      ? contribution.items.get(contribution.lastHitItemId) ?? null
      : null;
    return {
      enemyId,
      totalDamage: contribution.totalDamage,
      lastHitItemId: last?.itemId ?? null,
      lastHitCategory: last?.category ?? null,
      highestDamageItemId: highest?.itemId ?? null,
      highestDamageCategory: highest?.category ?? null,
      killed: true,
    };
  }
}

export function getLevelRewardMultiplier(playerLevel: number, enemyLevel: number): number {
  const difference = Math.max(0, Math.floor(playerLevel) - Math.floor(enemyLevel));
  if (difference <= PROGRESSION_CONFIG.rewardFullDifferenceMax) return 1;
  if (difference <= PROGRESSION_CONFIG.rewardReducedDifferenceMax) {
    return PROGRESSION_CONFIG.rewardReducedMultiplier;
  }
  if (difference <= PROGRESSION_CONFIG.rewardLowDifferenceMax) {
    return PROGRESSION_CONFIG.rewardLowMultiplier;
  }
  return PROGRESSION_CONFIG.lowLevelRewardMinimumMultiplier;
}

function masteryRewards(
  amount: number,
  contribution: RewardContribution,
): ItemMasteryReward[] {
  if (amount <= 0) return [];
  const highestId = contribution.highestDamageItemId;
  const highestCategory = contribution.highestDamageCategory;
  const lastId = contribution.lastHitItemId;
  const lastCategory = contribution.lastHitCategory;

  if (highestId && highestCategory && highestId === lastId) {
    return [{ itemId: highestId, category: highestCategory, amount }];
  }
  if (!highestId || !highestCategory) {
    return lastId && lastCategory ? [{ itemId: lastId, category: lastCategory, amount }] : [];
  }
  if (!lastId || !lastCategory) {
    return [{ itemId: highestId, category: highestCategory, amount }];
  }

  const highestAmount = Math.round(amount * PROGRESSION_CONFIG.masteryHighestDamageShare);
  return [
    { itemId: highestId, category: highestCategory, amount: highestAmount },
    { itemId: lastId, category: lastCategory, amount: amount - highestAmount },
  ].filter((reward) => reward.amount > 0);
}

export function grantEnemyRewards(
  sink: RewardSink,
  enemy: RewardEnemy,
  contribution: RewardContribution,
): GrantedReward {
  if (!contribution.killed || contribution.totalDamage <= 0) {
    return { playerExp: 0, coins: 0, mastery: [], multiplier: 0 };
  }

  const baseMultiplier = getLevelRewardMultiplier(sink.level, enemy.level);
  const multiplier = enemy.isBoss
    ? Math.max(PROGRESSION_CONFIG.bossMinimumRewardMultiplier, baseMultiplier)
    : baseMultiplier;
  const playerExp = Math.floor(enemy.reward.playerExp * multiplier);
  const masteryAmount = Math.floor(enemy.reward.masteryExp * multiplier);
  const coinMultiplier = Math.max(PROGRESSION_CONFIG.coinMinimumRewardMultiplier, multiplier);
  const coins = Math.floor(enemy.reward.coins * coinMultiplier);
  const mastery = masteryRewards(masteryAmount, contribution);

  sink.addPlayerExp(playerExp, `enemy:${enemy.id}`);
  for (const reward of mastery) {
    sink.addMasteryExp(reward.itemId, reward.category, reward.amount);
  }
  sink.addCoins(coins, `enemy:${enemy.id}`);

  return { playerExp, coins, mastery, multiplier };
}
