import { describe, expect, it } from 'vitest';
import { defaultPlayerState } from './playerState.js';
import { prepareCanonicalPlayerHit, type CanonicalPveState } from './pveIncomingDamageAdapter.js';

const attack = (id = 'starter-crab-1:1', damage = 40) => ({
  source: 'monster-simulation' as const, attackId: id, targetId: 'player-1', damage, unblockable: false,
});
const state = (): CanonicalPveState => defaultPlayerState() as CanonicalPveState;

describe('prepareCanonicalPlayerHit', () => {
  it('accepts original colon attack ids and persists HP/guard outcome', () => {
    const current = state();
    current.checkpoint.hp = 100;
    const result = prepareCanonicalPlayerHit(current, 'player-hit-1', attack(), 10_000, true, 'player-1');
    expect(result).toMatchObject({ ok: true, replay: false, outcome: { taken: 10, guardDamage: 56 } });
    if (result.ok) {
      expect(result.state.checkpoint.hp).toBe(90);
      expect(result.state.pveCombat?.guard).toBe(44);
      expect(JSON.parse(JSON.stringify(result.state)).playerHitReceipts).toHaveLength(1);
    }
  });

  it('replays the same receipt without changing state and rejects key reuse', () => {
    const current = state();
    const first = prepareCanonicalPlayerHit(current, 'player-hit-1', attack(), 10_000, false, 'player-1');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const replay = prepareCanonicalPlayerHit(JSON.parse(JSON.stringify(first.state)) as CanonicalPveState,
      'player-hit-1', attack(), 10_001, false, 'player-1');
    expect(replay).toMatchObject({ ok: true, replay: true, outcome: first.outcome });
    const reused = prepareCanonicalPlayerHit(first.state, 'player-hit-1', attack('starter-crab-1:2'), 10_001, false, 'player-1');
    expect(reused).toEqual({ ok: false, code: 'IDEMPOTENCY_KEY_REUSED' });
  });
});
