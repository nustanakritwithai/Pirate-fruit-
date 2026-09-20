import { describe, expect, it } from 'vitest';
import { MONSTER_REWARD_TABLE, computeEnemyReward } from '@pirate-fruit/shared';
import { defaultPlayerState } from './playerState.js';
import { prepareCanonicalReward } from './centralRewardAdapter.js';

describe('central original reward transaction', () => {
  it('uses original reward formula and records an idempotent receipt without mutating input', () => {
    const state = defaultPlayerState();
    const monsterId = Object.keys(MONSTER_REWARD_TABLE)[0]!;
    const expected = computeEnemyReward(state.progression.level, MONSTER_REWARD_TABLE[monsterId]!);
    const before = structuredClone(state);
    const first = prepareCanonicalReward(state, 'world-kill:fixture:1', [{ monsterId, count: 1 }]);
    expect(state).toEqual(before);
    expect(first.outcome.totals).toEqual(expected);
    expect(first.state.progression.coins).toBe(state.progression.coins + expected.coins);
    const replay = prepareCanonicalReward(first.state, 'world-kill:fixture:1', [{ monsterId, count: 1 }]);
    expect(replay.state).toEqual(first.state);
    expect(replay.outcome.idempotentReplay).toBe(true);
    expect(() => prepareCanonicalReward(first.state, 'world-kill:fixture:1', [{ monsterId, count: 2 }])).toThrow('IDEMPOTENCY_KEY_REUSED');
  });
});
