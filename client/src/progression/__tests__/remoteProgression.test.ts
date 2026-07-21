import { describe, expect, it } from 'vitest';
import { applyExpToProgress, expRequiredForLevel } from '@pirate-fruit/shared';
import { ProgressionManager } from '../ProgressionManager';
import { MemoryStorage } from './testUtils';
import {
  reconcileProgression,
  totalExpOf,
  type RemoteProgressionExecutor,
} from '../RemoteProgressionClient';
import { applyPlayerExp, getExpRequiredForLevel } from '../LevelSystem';

function executorWith(level: number, exp: number, coins = 0): RemoteProgressionExecutor {
  return {
    async state() {
      return { ok: true, schemaVersion: 1, level, exp, coins };
    },
  };
}

describe('S12 shared level curve parity', () => {
  it('client formula delegates to the shared curve', () => {
    for (const level of [1, 2, 10, 100, 777]) {
      expect(getExpRequiredForLevel(level)).toBe(expRequiredForLevel(level));
    }
  });

  it('applyPlayerExp walks identically to the shared walk', () => {
    const player = { level: 1, exp: 0, statPoints: 0, stats: {} } as never as Parameters<typeof applyPlayerExp>[0];
    const result = applyPlayerExp(player, 90);
    expect(result.newLevel).toBe(2);
    expect(result.remainingExp).toBe(4);
    expect(result.statPointsGained).toBe(3);
    expect(applyExpToProgress({ level: 1, exp: 0 }, 90)).toMatchObject({ level: 2, exp: 4 });
  });
});

describe('S12 progression reconcile', () => {
  it('applies the positive delta when the server is ahead', async () => {
    const progression = new ProgressionManager({ storage: new MemoryStorage() });
    expect(progression.level).toBe(1);
    // Server อยู่เลเวล 2 เหลือ 4 exp (= total 90)
    const changed = await reconcileProgression(executorWith(2, 4), progression);
    expect(changed).toBe(true);
    expect(progression.level).toBe(2);
    expect(progression.getState().player.exp).toBe(4);
  });

  it('leaves local progress alone when local is ahead (pending syncs converge)', async () => {
    const progression = new ProgressionManager({ storage: new MemoryStorage() });
    progression.addPlayerExp(500);
    const before = { ...progression.getState().player };
    const changed = await reconcileProgression(executorWith(1, 0), progression);
    expect(changed).toBe(false);
    expect(progression.getState().player.level).toBe(before.level);
    expect(progression.getState().player.exp).toBe(before.exp);
  });

  it('reconciles the canonical Server wallet even when EXP is unchanged', async () => {
    const progression = new ProgressionManager({ storage: new MemoryStorage() });
    expect(progression.coins).toBe(0);
    const changed = await reconcileProgression(executorWith(1, 0, 109), progression);
    expect(changed).toBe(true);
    expect(progression.coins).toBe(109);
  });

  it('does nothing when the server is unreachable', async () => {
    const progression = new ProgressionManager({ storage: new MemoryStorage() });
    const offline: RemoteProgressionExecutor = {
      state: async () => { throw new Error('offline'); },
    };
    expect(await reconcileProgression(offline, progression)).toBe(false);
    expect(progression.level).toBe(1);
  });

  it('totalExpOf converts (level, exp) into a comparable cumulative total', () => {
    expect(totalExpOf(1, 0)).toBe(0);
    expect(totalExpOf(1, 85)).toBe(85);
    expect(totalExpOf(2, 0)).toBe(expRequiredForLevel(1));
    expect(totalExpOf(3, 7)).toBe(expRequiredForLevel(1) + expRequiredForLevel(2) + 7);
  });
});
