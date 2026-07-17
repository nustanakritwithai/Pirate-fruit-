import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MONSTER_REWARD_TABLE, computeEnemyReward } from '@pirate-fruit/shared';
import { MONSTER_TYPES } from '../MonsterData';
import { ProgressionManager } from '../../progression/ProgressionManager';
import { MemoryStorage } from '../../progression/__tests__/testUtils';
import { RemoteMonsterSync } from '../RemoteMonsterSync';
import { RemoteMonsterError, type RemoteMonsterExecutor } from '../RemoteMonsterClient';
import type { RewardContribution, RewardEnemy } from '../../progression/ProgressionTypes';

/** databook ฝั่งเกมกับตาราง shared (ที่ Server ใช้คิดรางวัล) ต้องตรงกันเป๊ะ */
describe('S11 monster reward table consistency', () => {
  it('mirrors every MONSTER_TYPES entry into the shared reward table', () => {
    const ids = Object.keys(MONSTER_TYPES);
    expect(Object.keys(MONSTER_REWARD_TABLE).sort()).toEqual([...ids].sort());
    for (const id of ids) {
      const type = MONSTER_TYPES[id];
      expect(MONSTER_REWARD_TABLE[id], id).toEqual({
        level: type.level,
        isBoss: type.kind === 'boss',
        playerExp: type.reward.playerExp,
        masteryExp: type.reward.masteryExp,
        coins: type.reward.coins,
      });
    }
  });
});

class FakeStorage {
  private data = new Map<string, string>();
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { this.data.set(key, value); }
  removeItem(key: string): void { this.data.delete(key); }
}

function contributionFor(itemId: string): RewardContribution {
  return {
    enemyId: 'crab',
    totalDamage: 100,
    lastHitItemId: itemId,
    lastHitCategory: 'style',
    highestDamageItemId: itemId,
    highestDamageCategory: 'style',
    killed: true,
  };
}

const CRAB: RewardEnemy = {
  id: 'crab',
  level: MONSTER_REWARD_TABLE.crab.level,
  isBoss: false,
  reward: {
    playerExp: MONSTER_REWARD_TABLE.crab.playerExp,
    masteryExp: MONSTER_REWARD_TABLE.crab.masteryExp,
    coins: MONSTER_REWARD_TABLE.crab.coins,
  },
};

function fakeExecutor(level = 1) {
  const calls: { kills: { monsterId: string; count: number }[]; key: string }[] = [];
  const behavior = { failures: 0 };
  const executor: RemoteMonsterExecutor = {
    async reportKills(kills, idempotencyKey) {
      if (behavior.failures > 0) {
        behavior.failures -= 1;
        throw new RemoteMonsterError('NETWORK', 'offline');
      }
      calls.push({ kills: kills.map((kill) => ({ ...kill })), key: idempotencyKey });
      const rewards = kills.map((kill) => {
        const computed = computeEnemyReward(level, MONSTER_REWARD_TABLE[kill.monsterId]!);
        return {
          monsterId: kill.monsterId,
          count: kill.count,
          playerExp: computed.playerExp * kill.count,
          coins: computed.coins * kill.count,
          masteryExp: computed.masteryExp * kill.count,
        };
      });
      const totals = rewards.reduce(
        (sum, r) => ({
          playerExp: sum.playerExp + r.playerExp,
          coins: sum.coins + r.coins,
          masteryExp: sum.masteryExp + r.masteryExp,
        }),
        { playerExp: 0, coins: 0, masteryExp: 0 },
      );
      return {
        ok: true as const,
        schemaVersion: 1 as const,
        rewards,
        totals,
        coinsTotal: 999,
        idempotentReplay: false,
      };
    },
  };
  return { executor, calls, behavior };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('S11 remote monster sync', () => {
  it('suppresses the local grant and applies server-decided rewards', async () => {
    const progression = new ProgressionManager({ storage: new MemoryStorage() });
    const { executor, calls } = fakeExecutor(progression.level);
    const storage = new FakeStorage();
    const sync = new RemoteMonsterSync(executor, progression, storage);
    progression.setRemoteEnemyRewarder((enemy, contribution) =>
      sync.enqueueKill(enemy, contribution));

    const coinsBefore = progression.coins;
    const granted = progression.grantEnemyRewards(CRAB, contributionFor('basic-brawl'));
    // ยังไม่มีรางวัล local — รอ Server
    expect(granted).toEqual({ playerExp: 0, coins: 0, mastery: [], multiplier: 0 });
    expect(progression.coins).toBe(coinsBefore);

    await vi.advanceTimersByTimeAsync(1_300);
    const expected = computeEnemyReward(1, MONSTER_REWARD_TABLE.crab);
    expect(calls).toHaveLength(1);
    expect(calls[0].kills).toEqual([{ monsterId: 'crab', count: 1 }]);
    expect(progression.coins).toBe(coinsBefore + expected.coins);
    expect(progression.getMasteryLevel('basic-brawl')).toBeGreaterThanOrEqual(1);
    expect(progression.getState().mastery['basic-brawl']?.exp ?? 0).toBeGreaterThan(0);
    sync.stop();
  });

  it('batches rapid kills into one report', async () => {
    const progression = new ProgressionManager({ storage: new MemoryStorage() });
    const { executor, calls } = fakeExecutor(progression.level);
    const sync = new RemoteMonsterSync(executor, progression, new FakeStorage());
    progression.setRemoteEnemyRewarder((enemy, contribution) =>
      sync.enqueueKill(enemy, contribution));

    for (let index = 0; index < 4; index += 1) {
      progression.grantEnemyRewards(CRAB, contributionFor('basic-brawl'));
    }
    await vi.advanceTimersByTimeAsync(1_300);
    expect(calls).toHaveLength(1);
    expect(calls[0].kills).toHaveLength(4);
    sync.stop();
  });

  it('keeps the queue and the same idempotency key across network failures', async () => {
    const progression = new ProgressionManager({ storage: new MemoryStorage() });
    const { executor, calls, behavior } = fakeExecutor(progression.level);
    const storage = new FakeStorage();
    const sync = new RemoteMonsterSync(executor, progression, storage);
    progression.setRemoteEnemyRewarder((enemy, contribution) =>
      sync.enqueueKill(enemy, contribution));

    behavior.failures = 2;
    progression.grantEnemyRewards(CRAB, contributionFor('basic-brawl'));
    const coinsBefore = progression.coins;
    await vi.advanceTimersByTimeAsync(1_300); // fail 1
    await vi.advanceTimersByTimeAsync(5_100); // fail 2
    expect(progression.coins).toBe(coinsBefore);

    // batch key ถูกจำไว้ระหว่างพัง — สำเร็จแล้วใช้ key เดิม (server idempotent)
    const persisted = JSON.parse(storage.getItem('pirate-fruit:pending-kills-v1')!) as {
      batch?: { key: string };
    };
    const pendingKey = persisted.batch?.key;
    expect(pendingKey).toBeTruthy();

    await vi.advanceTimersByTimeAsync(5_100); // success
    expect(calls).toHaveLength(1);
    expect(calls[0].key).toBe(pendingKey);
    expect(progression.coins).toBeGreaterThan(coinsBefore);
    sync.stop();
  });

  it('restores the pending queue from storage after a reload', async () => {
    const progression = new ProgressionManager({ storage: new MemoryStorage() });
    const storage = new FakeStorage();
    const offline = fakeExecutor(progression.level);
    offline.behavior.failures = 99;
    const first = new RemoteMonsterSync(offline.executor, progression, storage);
    progression.setRemoteEnemyRewarder((enemy, contribution) =>
      first.enqueueKill(enemy, contribution));
    progression.grantEnemyRewards(CRAB, contributionFor('basic-brawl'));
    first.stop();

    // "รีเฟรช" — sync ใหม่อ่านคิวเดิมจาก storage แล้วส่งเองทันที
    const online = fakeExecutor(progression.level);
    const coinsBefore = progression.coins;
    const second = new RemoteMonsterSync(online.executor, progression, storage);
    await vi.advanceTimersByTimeAsync(100);
    expect(online.calls).toHaveLength(1);
    expect(progression.coins).toBeGreaterThan(coinsBefore);
    second.stop();
  });

  it('local mode grants immediately when no rewarder is set (flag off unchanged)', () => {
    const progression = new ProgressionManager({ storage: new MemoryStorage() });
    const coinsBefore = progression.coins;
    const granted = progression.grantEnemyRewards(CRAB, contributionFor('basic-brawl'));
    expect(granted.coins).toBeGreaterThan(0);
    expect(progression.coins).toBe(coinsBefore + granted.coins);
  });
});
