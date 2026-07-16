import { describe, expect, it } from 'vitest';
import type { PersistedPlayerState } from '@pirate-fruit/shared';
import {
  PlayerDocumentValidationError,
  sanitizeLocalMigrationDocuments,
  sanitizePlayerDocuments,
  serializePlayerState,
} from './playerState.js';

function documents(overrides: Partial<PersistedPlayerState> = {}): PersistedPlayerState {
  return {
    schemaVersion: 1,
    checkpoint: null,
    progression: null,
    inventory: null,
    boats: null,
    loadout: null,
    ...overrides,
  };
}

describe('S6 player save documents', () => {
  it('rejects a checkpoint spawn that does not belong to its island', () => {
    expect(() => sanitizePlayerDocuments(documents({
      checkpoint: JSON.stringify({
        saveVersion: 4,
        islandId: 'starter-island',
        spawnId: 'desert-port',
        x: 0,
        y: 0,
        z: 8,
      }),
    }))).toThrow(PlayerDocumentValidationError);
  });

  it('rejects non-finite and out-of-world checkpoint coordinates', () => {
    expect(() => sanitizePlayerDocuments(documents({
      checkpoint: JSON.stringify({ saveVersion: 4, x: 99_999, y: 0, z: 0 }),
    }))).toThrow(/world bounds/);
  });

  it('repairs known legacy checkpoint metadata only during one-time migration', () => {
    const state = sanitizeLocalMigrationDocuments(documents({
      checkpoint: JSON.stringify({
        saveVersion: 1,
        islandId: 'mist-jungle',
        spawnId: 'starter-village',
        x: 99_999,
        y: null,
        z: -120,
        hp: 240,
        mp: 100,
        energy: 100,
      }),
      progression: JSON.stringify({
        version: 1,
        progression: {
          player: { level: 28, stats: { vitality: 29 } },
          coins: 12_757,
        },
      }),
    }));

    expect(state.checkpoint).toMatchObject({
      islandId: 'starter-island',
      spawnId: 'starter-village',
      position: { x: 0, y: 0, z: 8 },
    });
    expect(state.progression).toMatchObject({ level: 28, coins: 12_757 });
  });

  it('uses progression coins as the only canonical balance', () => {
    const state = sanitizePlayerDocuments(documents({
      progression: JSON.stringify({ version: 1, progression: { coins: 125 } }),
      inventory: JSON.stringify({ coins: 9_999_999, ownedSwords: ['training-sword'] }),
      boats: JSON.stringify({
        coins: 8_888_888,
        ownedBoatIds: ['training-dinghy'],
        selectedBoatId: 'training-dinghy',
      }),
    }));
    const serialized = serializePlayerState(state).player;
    expect(JSON.parse(serialized.inventory!).coins).toBe(125);
    expect(JSON.parse(serialized.boats!).coins).toBe(125);
  });

  it('sanitizes duplicate and unknown inventory, boats, and cargo entries', () => {
    const state = sanitizePlayerDocuments(
      documents({
        inventory: JSON.stringify({
          ownedSwords: ['training-sword', 'training-sword', '../bad'],
          consumables: { potion: 2, '../bad': 100 },
        }),
        boats: JSON.stringify({
          ownedBoatIds: ['training-dinghy', 'training-dinghy', 'admin-yacht'],
          selectedBoatId: 'training-dinghy',
        }),
      }),
      {
        schemaVersion: 1,
        cargo: JSON.stringify({ slots: [
          { commodityId: 'fresh-fish', quantity: 2 },
          { commodityId: 'fresh-fish', quantity: 3 },
          { commodityId: 'counterfeit', quantity: 99 },
        ] }),
      },
    );
    expect(state.inventory.ownedSwords).toEqual(['training-sword']);
    expect(state.boats).toHaveLength(1);
    expect(state.cargo.slots).toEqual([{ commodityId: 'fresh-fish', quantity: 5 }]);
  });

  it('rejects an unsupported document schema version', () => {
    expect(() => sanitizePlayerDocuments({ ...documents(), schemaVersion: 99 }))
      .toThrow(/schema version/);
  });
});
