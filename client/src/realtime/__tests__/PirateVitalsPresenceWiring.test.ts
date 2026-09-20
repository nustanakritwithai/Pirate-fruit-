import { describe, expect, it } from 'vitest';
import { parsePiratePresenceSnapshotMessage, PIRATE_PRESENCE_SNAPSHOT_MESSAGE } from '../PocketMonsterParentPresence';
import { PIRATE_VITALS_CONTRACT } from '../PirateVitalsAuthority';
import { PirateVitalsAuthority } from '../PirateVitalsAuthority';
import { applyPirateVitalsSnapshot } from '../PirateVitalsClientBridge';

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
      payload: {
        zone: 'pirate-fruit',
        players: [],
        pirateWorld: {
          contract: 'pirate-original-world/1', viewerId: 'player-1', generation: 1, sequence: 1,
          messages: [], vitals,
        },
      },
    });
    expect(parsed?.vitals?.revision).toBe(4);
    expect(parsed?.vitals?.hp).toBe(80);
  });

  it('rejects a malformed vitals envelope instead of retaining an older state', () => {
    const parsed = parsePiratePresenceSnapshotMessage({
      type: PIRATE_PRESENCE_SNAPSHOT_MESSAGE,
      payload: {
        zone: 'pirate-fruit',
        players: [],
        pirateWorld: {
          contract: 'pirate-original-world/1', viewerId: 'player-1', generation: 1, sequence: 1,
          messages: [], vitals: { ...vitals, hp: 101 },
        },
      },
    });
    expect(parsed).toBeNull();
  });

  it('applies HP and guard from the actual original-world envelope', () => {
    const parsed = parsePiratePresenceSnapshotMessage({
      type: PIRATE_PRESENCE_SNAPSHOT_MESSAGE,
      payload: {
        zone: 'pirate-fruit',
        players: [],
        pirateWorld: {
          contract: 'pirate-original-world/1', viewerId: 'player-1', generation: 1, sequence: 1,
          messages: [], vitals,
        },
      },
    });
    const combat = { setServerVitalsAuthority: () => undefined, applyServerVitals: (value: typeof vitals) => {
      expect(value.hp).toBe(80);
      expect(value.guard).toBe(20);
    } } as any;
    const controller = { setServerVitalsAuthority: () => undefined } as any;
    const spawn = { setServerVitalsAuthority: () => undefined, activateSpawnPoint: () => true } as any;
    expect(applyPirateVitalsSnapshot(new PirateVitalsAuthority(), controller, combat, spawn, parsed?.pirateWorld?.vitals)).toBe(true);
  });
});
