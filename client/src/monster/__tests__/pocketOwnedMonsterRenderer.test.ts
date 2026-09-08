import { describe, expect, it } from 'vitest';
import { isValidOwnedMonsterActor, ownedMonsterActionKey, type OwnedMonsterActor } from '../PocketOwnedMonsterRenderer';

const actor = (overrides: Partial<OwnedMonsterActor> = {}): OwnedMonsterActor => ({
  actorId: 'owned:player-1:slot-0', kind: 'monster', ownerId: 'player-1',
  monsterType: 'monster.flameling.flameling.bighead.v1', zone: 'STARTER-ISLAND',
  generation: 1, spawnSequence: 1, stateSequence: 1, lifecycle: 'active',
  pose: { x: 1, y: 0, z: 2, dir: 0 }, locomotion: 'idle',
  authority: { authorityVersion: 'monster-authority/1', generation: 1, hp: { current: 10, max: 20, revision: 1 } },
  ...overrides,
});

describe('PocketOwnedMonsterRenderer contract gate', () => {
  it('accepts owned actors with catalog asset and authority', () => {
    expect(isValidOwnedMonsterActor(actor())).toBe(true);
  });

  it('rejects ambient actor ids, unknown assets, and mismatched authority generation', () => {
    expect(isValidOwnedMonsterActor(actor({ actorId: 'monster:ambient-1' }))).toBe(false);
    expect(isValidOwnedMonsterActor(actor({ monsterType: 'monster.unknown.unknown.bighead.v1' }))).toBe(false);
    expect(isValidOwnedMonsterActor(actor({ authority: { ...actor().authority, generation: 2 } }))).toBe(false);
  });

  it('rejects forged hp values instead of inventing client state', () => {
    expect(isValidOwnedMonsterActor(actor({ authority: { ...actor().authority, hp: { current: 99, max: 20, revision: 2 } } }))).toBe(false);
  });

  it('requires protocol lifecycle and locomotion enums', () => {
    expect(isValidOwnedMonsterActor(actor({ lifecycle: 'removed' as OwnedMonsterActor['lifecycle'] }))).toBe(false);
    expect(isValidOwnedMonsterActor(actor({ locomotion: 'fly' as OwnedMonsterActor['locomotion'] }))).toBe(false);
  });

  it('keys animation by action session/sequence, not the transport state sequence', () => {
    const first = actor({ stateSequence: 10, actionSessionId: 'combat-1', actionSequence: 4 });
    const sameAction = actor({ stateSequence: 11, actionSessionId: 'combat-1', actionSequence: 4 });
    const nextAction = actor({ stateSequence: 12, actionSessionId: 'combat-1', actionSequence: 5 });
    expect(ownedMonsterActionKey(first)).toBe(ownedMonsterActionKey(sameAction));
    expect(ownedMonsterActionKey(first)).not.toBe(ownedMonsterActionKey(nextAction));
  });
});
