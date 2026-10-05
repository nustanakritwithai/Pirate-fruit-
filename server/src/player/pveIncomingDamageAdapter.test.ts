import { describe, expect, it } from 'vitest';
import { defaultPlayerState } from './playerState.js';
import { prepareCanonicalPlayerHit, type CanonicalPveState } from './pveIncomingDamageAdapter.js';

const attack = (id = 'starter-crab-1:1', damage = 40) => ({
  source: 'monster-simulation' as const, attackId: id, targetId: 'player-1', damage, unblockable: false,
});
const state = (): CanonicalPveState => defaultPlayerState() as CanonicalPveState;

describe('prepareCanonicalPlayerHit', () => {
  it('refreshes original 350ms hitstun on each new hit but never on receipt replay', () => {
    const first = prepareCanonicalPlayerHit(state(), 'hit-stun-1', attack('hit:1', 1), 10_000, false, 'player-1');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.state.pveCombat?.hitstunUntil).toBe(10_350);
    const second = prepareCanonicalPlayerHit(first.state, 'hit-stun-2', attack('hit:2', 1), 10_100, false, 'player-1');
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.state.pveCombat?.hitstunUntil).toBe(10_450);
    const replay = prepareCanonicalPlayerHit(second.state, 'hit-stun-2', attack('hit:2', 1), 10_200, false, 'player-1');
    expect(replay).toMatchObject({ ok: true, replay: true, state: { pveCombat: { hitstunUntil: 10_450 } } });
  });

  it('preserves longer guard-break stun and ignores zero damage for hitstun', () => {
    const initial = state();
    initial.pveCombat = { guard: 0, guardBroken: true, hitstunUntil: 12_000 };
    const hit = prepareCanonicalPlayerHit(initial, 'hit-stun-3', attack('hit:3', 1), 10_000, false, 'player-1');
    expect(hit).toMatchObject({ ok: true, state: { pveCombat: { hitstunUntil: 12_000 } } });
    const zero = prepareCanonicalPlayerHit(state(), 'hit-stun-4', attack('hit:4', 0), 10_000, false, 'player-1');
    expect(zero).toMatchObject({ ok: true, state: { pveCombat: { hitstunUntil: 0 } } });
  });
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
