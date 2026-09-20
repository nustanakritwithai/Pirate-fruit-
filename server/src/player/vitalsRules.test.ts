import { describe, expect, it } from 'vitest';
import { defaultPlayerState } from './playerState.js';
import { applyCanonicalVitalsOperation, advanceCanonicalVitals, type PveVitalsContext } from './vitalsRules.js';
import type { CanonicalPveState } from './pveIncomingDamageAdapter.js';

const context: PveVitalsContext = {
  now: 100_000, dtMs: 1_000, blocking: false, mounted: false, sprinting: false,
  inWater: false, devilFruitUser: false, combatActive: false,
};
const state = (): CanonicalPveState => defaultPlayerState() as CanonicalPveState;

describe('canonical PvE vitals', () => {
  it('regenerates HP only after damage delay and guard reblocks at threshold', () => {
    const current = state();
    current.checkpoint.hp = 50;
    current.pveVitals = { lastDamageAtMs: 93_900, potionCooldownUntil: 0, buffCooldowns: {}, buffMultiplier: 1, buffUntil: 0 };
    current.pveCombat = { guard: 20, guardBroken: true, hitstunUntil: 0 };
    const result = advanceCanonicalVitals(current, context);
    expect(result.changed).toBe(true);
    expect(result.state.checkpoint.hp).toBe(53.5);
    expect(result.state.pveCombat?.guard).toBe(34);
    expect(result.state.pveCombat?.guardBroken).toBe(false);
  });

  it('consumes the canonical potion atomically and replays without a second consume', () => {
    const current = state();
    current.checkpoint.hp = 10;
    current.inventory.consumables['potion-hp'] = 1;
    const first = applyCanonicalVitalsOperation(current, { type: 'potion', potionId: 'potion-hp', idempotencyKey: 'potion:1' }, context);
    expect(first.state.inventory.consumables['potion-hp']).toBe(0);
    expect(first.state.checkpoint.hp).toBe(85);
    const replay = applyCanonicalVitalsOperation(first.state, { type: 'potion', potionId: 'potion-hp', idempotencyKey: 'potion:1' }, context);
    expect(replay.state.inventory.consumables['potion-hp']).toBe(0);
  });

  it('charges MP from the trusted generated skill catalog and replays idempotently', () => {
    const current = state();
    current.inventory.loadout.activeSet = 'fruit';
    current.inventory.loadout.equippedFruitId = 'phoenix';
    current.progression.mastery.phoenix = { itemId: 'phoenix', category: 'fruit', level: 1, exp: 0 };
    current.checkpoint.mp = 50;
    const operation = { type: 'skill' as const, skillId: 'phoenix-moveset-v1-z', idempotencyKey: 'skill:phoenix-z' };
    const first = applyCanonicalVitalsOperation(current, operation, context);
    expect(first.state.checkpoint.mp).toBe(34);
    const replay = applyCanonicalVitalsOperation(first.state, operation, context);
    expect(replay.state.checkpoint.mp).toBe(34);
  });
});
