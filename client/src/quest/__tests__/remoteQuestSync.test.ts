import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProgressionManager } from '../../progression/ProgressionManager';
import { MemoryStorage } from '../../progression/__tests__/testUtils';
import { QuestManager } from '../QuestManager';
import { RemoteQuestSync } from '../RemoteQuestSync';
import { RemoteQuestError, type RemoteQuestExecutor } from '../RemoteQuestClient';
import { QUESTS_BY_ID } from '@pirate-fruit/shared';

const V = 1 as const;

/** executor ปลอม — โปรแกรมพฤติกรรม Server ต่อเทสต์ได้ */
function fakeExecutor() {
  const calls = { accept: [] as unknown[], progress: [] as unknown[][], claim: [] as string[] };
  const behavior = {
    state: { active: null as { questId: string; progress: number[]; status: 'active' | 'completed' } | null, completedQuestIds: [] as string[] },
    progressResult: null as { questId: string | null; progress: number[]; completed: boolean } | null,
    progressError: null as Error | null,
    claimError: null as Error | null,
  };
  const executor: RemoteQuestExecutor = {
    state: async () => ({
      ok: true, schemaVersion: V,
      active: behavior.state.active, completedQuestIds: behavior.state.completedQuestIds,
    }),
    accept: async (questId, replaceActive) => {
      calls.accept.push({ questId, replaceActive });
      return { ok: true, schemaVersion: V, questId, progress: [0] };
    },
    abandon: async () => undefined,
    progress: async (events) => {
      calls.progress.push(events);
      if (behavior.progressError) throw behavior.progressError;
      const fallbackTotal = events.reduce((sum, event) => sum + event.amount, 0);
      const result = behavior.progressResult
        ?? { questId: 'starter-crabs', progress: [Math.min(5, fallbackTotal)], completed: fallbackTotal >= 5 };
      return { ok: true, schemaVersion: V, ...result };
    },
    claim: async (questId, key) => {
      if (behavior.claimError) throw behavior.claimError;
      calls.claim.push(key);
      const rewards = QUESTS_BY_ID.get(questId)!.rewards;
      return {
        ok: true, schemaVersion: V, questId,
        playerExp: rewards.playerExp, coins: rewards.coins,
        masteryBonus: rewards.masteryBonus ?? 0,
        coinsTotal: 999, idempotentReplay: false,
      };
    },
  };
  return { executor, calls, behavior };
}

function harness() {
  const progression = new ProgressionManager({ storage: new MemoryStorage() });
  const quests = new QuestManager(progression, () => ({
    itemId: 'basic-brawl', category: 'style' as const, name: 'หมัด',
  }));
  const { executor, calls, behavior } = fakeExecutor();
  const sync = new RemoteQuestSync(executor, quests);
  quests.setRemoteSync(sync);
  return { progression, quests, sync, calls, behavior };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function drain(ms = 1_100): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

describe('S10 remote quest sync', () => {
  it('mirrors accept to the server and batches kill events into one report', async () => {
    const { quests, calls } = harness();
    expect(quests.acceptQuest('starter-crabs').accepted).toBe(true);
    await drain(0);
    expect(calls.accept).toEqual([{ questId: 'starter-crabs', replaceActive: false }]);

    quests.recordKill('crab', false);
    quests.recordKill('crab', false);
    quests.recordKill('crab', false);
    await drain();
    // สามฆ่าติดกันรวมเป็นรายงานเดียว (debounce + รวม amount)
    expect(calls.progress).toHaveLength(1);
    expect(calls.progress[0]).toEqual([
      { kind: 'kill', targetId: 'crab', amount: 3, isBoss: undefined },
    ]);
  });

  it('keeps a completed quest ready until the player explicitly turns it in', async () => {
    const { progression, quests, calls } = harness();
    quests.acceptQuest('starter-crabs');
    const coinsBefore = progression.coins;

    for (let index = 0; index < 5; index += 1) quests.recordKill('crab', false);
    // final objective stays pending until the Server confirms completion.
    expect(progression.coins).toBe(coinsBefore);
    expect(quests.getActiveQuest()?.completed).toBe(false);

    await drain();
    // Server ตอบ completed → คงสถานะเต็มไว้ก่อน ยังไม่แจกซ้ำ/ไม่ปิดเควสต์
    const rewards = QUESTS_BY_ID.get('starter-crabs')!.rewards;
    expect(calls.claim).toHaveLength(0);
    expect(progression.coins).toBe(coinsBefore);
    expect(quests.getActiveQuest()?.completed).toBe(true);

    quests.claimQuestReward();
    await drain(0);
    expect(calls.claim).toHaveLength(1);
    expect(progression.coins).toBe(coinsBefore + rewards.coins);
    expect(quests.getActiveQuest()).toBeNull();
    expect(progression.getState().completedQuestIds).toContain('starter-crabs');
  });

  it('overwrites local progress with the authoritative server progress', async () => {
    const { quests, behavior } = harness();
    quests.acceptQuest('starter-crabs');
    quests.recordKill('crab', false);
    quests.recordKill('crab', false);
    // Server เห็นแค่ 1 (เช่น event แรกโดน rate clamp) → local ต้องตามลง
    behavior.progressResult = { questId: 'starter-crabs', progress: [1], completed: false };
    await drain();
    expect(quests.getActiveQuest()?.progress).toEqual([1]);
  });

  it('keeps queued events across network failures and retries', async () => {
    const { progression, quests, calls, behavior } = harness();
    quests.acceptQuest('starter-crabs');
    behavior.progressError = new RemoteQuestError('NETWORK', 'offline');

    for (let index = 0; index < 5; index += 1) quests.recordKill('crab', false);
    await drain();
    expect(progression.coins).toBe(progression.getState().coins); // ยังไม่มีรางวัล
    const attempts = calls.progress.length;
    expect(attempts).toBeGreaterThanOrEqual(1);

    behavior.progressError = null;
    await drain(6_000); // retry 5s; progress reaches ready state
    expect(calls.progress.length).toBeGreaterThan(attempts);
    expect(calls.claim).toHaveLength(0);
    quests.claimQuestReward();
    await drain(0);
    expect(calls.claim).toHaveLength(1);
    expect(quests.getActiveQuest()).toBeNull();
  });

  it('reconciles on boot: server active quest wins over local', async () => {
    const { quests, sync, behavior } = harness();
    quests.setRemoteSync(null); // จำลองสถานะ local เก่าที่ค้างไว้ก่อนเปิด flag
    quests.acceptQuest('starter-pirates');
    quests.setRemoteSync(sync);

    behavior.state.active = { questId: 'starter-crabs', progress: [2], status: 'active' };
    await sync.reconcile();
    const active = quests.getActiveQuest();
    expect(active?.definition.id).toBe('starter-crabs');
    expect(active?.progress).toEqual([2]);
  });

  it('reconciles on boot: local-only quest is re-accepted and progress replayed', async () => {
    const { quests, sync, calls, behavior } = harness();
    quests.setRemoteSync(null);
    quests.acceptQuest('starter-crabs');
    quests.recordKill('crab', false);
    quests.recordKill('crab', false);
    quests.setRemoteSync(sync);

    behavior.state.active = null;
    await sync.reconcile();
    await drain(0);
    expect(calls.accept).toEqual([{ questId: 'starter-crabs', replaceActive: true }]);
    expect(calls.progress).toHaveLength(1);
    expect(calls.progress[0]).toEqual([
      { kind: 'kill', targetId: 'crab', amount: 2, isBoss: undefined, islandId: undefined },
    ]);
  });

  it('keeps a quest the server already marked completed on boot ready to turn in', async () => {
    const { progression, quests, sync, calls, behavior } = harness();
    behavior.state.active = { questId: 'starter-crabs', progress: [5], status: 'completed' };
    const coinsBefore = progression.coins;
    await sync.reconcile();
    await drain(0);
    expect(calls.claim).toHaveLength(0);
    expect(progression.coins).toBe(coinsBefore);
    expect(quests.getActiveQuest()?.completed).toBe(true);
    quests.claimQuestReward();
    await drain(0);
    expect(calls.claim).toHaveLength(1);
    expect(progression.coins).toBe(coinsBefore + QUESTS_BY_ID.get('starter-crabs')!.rewards.coins);
    expect(quests.getActiveQuest()).toBeNull();
  });

  it('local mode still grants rewards immediately (flag off unchanged)', () => {
    const { progression, quests } = harness();
    quests.setRemoteSync(null);
    quests.acceptQuest('starter-crabs');
    const coinsBefore = progression.coins;
    for (let index = 0; index < 5; index += 1) quests.recordKill('crab', false);
    expect(progression.coins).toBe(coinsBefore + QUESTS_BY_ID.get('starter-crabs')!.rewards.coins);
    expect(quests.getActiveQuest()).toBeNull();
  });
});
