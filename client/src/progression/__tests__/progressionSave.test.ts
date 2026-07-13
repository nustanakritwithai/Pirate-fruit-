import { describe, expect, it } from 'vitest';
import {
  LEGACY_BOAT_STORAGE_KEY,
  PROGRESSION_STORAGE_KEY,
  createDefaultProgressionState,
  loadProgression,
  saveProgression,
  sanitizeProgressionState,
} from '../ProgressionSave';
import { MemoryStorage } from './testUtils';

describe('ProgressionSave', () => {
  it('migrates legacy boat coins without losing old ownership data', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      LEGACY_BOAT_STORAGE_KEY,
      JSON.stringify({ coins: 321, ownedBoatIds: ['rowboat'], selectedBoatId: 'rowboat' }),
    );
    const state = loadProgression(storage);
    expect(state.coins).toBe(321);
    expect(state.player.level).toBe(1);
    expect(state.mastery['basic-brawl'].level).toBe(1);
    expect(state.mastery['training-sword'].level).toBe(1);
  });

  it('uses progression as the source of truth after the first P6 save', () => {
    const storage = new MemoryStorage();
    const state = createDefaultProgressionState(80);
    state.player.level = 4;
    saveProgression(storage, state);
    storage.setItem(LEGACY_BOAT_STORAGE_KEY, JSON.stringify({ coins: 999 }));
    expect(storage.getItem(PROGRESSION_STORAGE_KEY)).not.toBeNull();
    expect(loadProgression(storage).coins).toBe(80);
    expect(loadProgression(storage).player.level).toBe(4);
  });

  it('sanitizes malformed and out-of-range save values', () => {
    const state = sanitizeProgressionState({
      player: {
        level: 9_999_999,
        exp: -10,
        statPoints: Number.NaN,
        stats: { combat: 0, vitality: 9_999_999, blade: 3, ranged: 1, fruitPower: 1 },
      },
      coins: -400,
    });
    expect(state.player.level).toBe(2800); // clamp ที่ maxLevel (wiki)
    expect(state.player.exp).toBe(0);
    expect(state.player.stats.combat).toBe(1);
    expect(state.player.stats.vitality).toBe(2800); // clamp ที่ maxStatPerCategory (wiki)
    expect(state.coins).toBe(0);
  });
});
