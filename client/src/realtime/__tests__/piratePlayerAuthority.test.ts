import { describe, expect, it } from 'vitest';
import { newerPiratePlayerAuthority, PiratePlayerAuthorityReceiver, sanitizePiratePlayerAuthority } from '../PiratePlayerAuthority';

const valid = {
  schemaVersion: 1,
  serverTimeUtc: '2026-09-09T00:00:00.000Z',
  players: [{ playerId: 'guest-a', generation: 1, stateSequence: 4, hp: { current: 37.5, max: 100, revision: 2 }, resultRevision: 1, lifeState: 'alive' }],
};

describe('Pirate player authority', () => {
  it('accepts fractional HP and preserves exact revisions', () => {
    expect(sanitizePiratePlayerAuthority(valid)?.players[0]).toEqual(valid.players[0]);
  });

  it('rejects malformed, stale identity fields without inventing legacy state', () => {
    expect(sanitizePiratePlayerAuthority({ ...valid, players: [{ ...valid.players[0], generation: 0 }] })).toBeNull();
    expect(sanitizePiratePlayerAuthority({ ...valid, players: [{ ...valid.players[0], hp: { current: 101, max: 100, revision: 0 } }] })).toEqual({ ...valid, players: [] });
    expect(sanitizePiratePlayerAuthority({ ...valid, players: [{ ...valid.players[0], playerId: 'guest-a' }, { ...valid.players[0] }] })).toEqual({ ...valid, players: [valid.players[0]] });
  });

  it('gates reconnect generations and same-state revisions monotonically', () => {
    const current = sanitizePiratePlayerAuthority(valid)!.players[0];
    expect(newerPiratePlayerAuthority(current, { ...current, stateSequence: 3 })).toBe(false);
    expect(newerPiratePlayerAuthority(current, { ...current, hp: { ...current.hp, revision: 3 } })).toBe(true);
    expect(newerPiratePlayerAuthority(current, { ...current, generation: 2, stateSequence: 0 })).toBe(true);
    expect(newerPiratePlayerAuthority(current, { ...current, stateSequence: 5, hp: { ...current.hp, revision: 1 } })).toBe(false);
  });

  it('applies self and observer state once, without healing on roster omission', () => {
    const receiver = new PiratePlayerAuthorityReceiver();
    const first = receiver.apply(valid, 'guest-a');
    expect(first?.authoritativeModeValid).toBe(true);
    expect(first?.self?.hp.current).toBe(37.5);
    const omitted = receiver.apply({ ...valid, players: [] }, 'guest-a');
    expect(omitted?.authoritativeModeValid).toBe(true);
    expect(omitted?.self?.hp.current).toBe(37.5);
  });

  it('accepts bounded attack results and rejects duplicate or malformed rosters', () => {
    const result = { attackerId: 'guest-a', targetId: 'guest-b', attackId: 'slash-1', generation: 1,
      resultRevision: 1, authoritativeFinalHp: 64, serverTimeUtc: valid.serverTimeUtc };
    const snapshot = { ...valid, results: [result] };
    expect(sanitizePiratePlayerAuthority(snapshot)?.results).toEqual([result]);
    expect(sanitizePiratePlayerAuthority({ ...snapshot, results: [result, result] })).toBeNull();
  });

  it('keeps authority active through roster omission and high-waters results per target generation', () => {
    const receiver = new PiratePlayerAuthorityReceiver();
    expect(receiver.apply(valid, 'GUEST-A')?.authoritativeModeValid).toBe(true);
    expect(receiver.apply({ ...valid, players: [] }, 'guest-a')?.authoritativeModeValid).toBe(true);
    const base = { attackerId: 'a', targetId: 'guest-a', generation: 1, authoritativeFinalHp: 90, serverTimeUtc: valid.serverTimeUtc };
    expect(receiver.apply({ ...valid, players: [], results: [{ ...base, attackId: 'one', resultRevision: 5 }] }, 'guest-a')?.acceptedResults).toHaveLength(1);
    expect(receiver.apply({ ...valid, players: [], results: [{ ...base, attackId: 'two', resultRevision: 4 }] }, 'guest-a')?.acceptedResults).toHaveLength(0);
  });
});
