import { describe, expect, it } from 'vitest';
import { parsePiratePresenceSnapshotMessage, PIRATE_PRESENCE_SNAPSHOT_MESSAGE } from '../PocketMonsterParentPresence';
import { PIRATE_VITALS_CONTRACT } from '../PirateVitalsAuthority';

const vitals = {
  contract: PIRATE_VITALS_CONTRACT,
  revision: 4,
  serverTimeMs: 1000,
  hp: 80,
  maxHp: 100,
  guard: 20,
  guardMax: 100,
  guardBroken: false,
  hitstunUntil: 0,
  energy: 50,
  maxEnergy: 100,
  mp: 30,
  maxMp: 100,
  dead: false,
};

describe('Pirate vitals presence wiring', () => {
  it('keeps a valid vitals envelope for the client authority bridge', () => {
    const parsed = parsePiratePresenceSnapshotMessage({
      type: PIRATE_PRESENCE_SNAPSHOT_MESSAGE,
      payload: { zone: 'pirate-fruit', players: [], vitals },
    });
    expect(parsed?.vitals?.revision).toBe(4);
    expect(parsed?.vitals?.hp).toBe(80);
  });

  it('rejects a malformed vitals envelope instead of retaining an older state', () => {
    const parsed = parsePiratePresenceSnapshotMessage({
      type: PIRATE_PRESENCE_SNAPSHOT_MESSAGE,
      payload: { zone: 'pirate-fruit', players: [], vitals: { ...vitals, hp: 101 } },
    });
    expect(parsed).toBeNull();
  });
});
