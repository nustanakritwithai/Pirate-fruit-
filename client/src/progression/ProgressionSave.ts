import { PROGRESSION_CONFIG } from './ProgressionData';
import type {
  LoadoutCategory,
  MasteryEntry,
  PlayerStats,
  ProgressionState,
  StorageLike,
} from './ProgressionTypes';

export const PROGRESSION_STORAGE_KEY = 'pirate-fruit:progression-v1';
export const LEGACY_BOAT_STORAGE_KEY = 'pirate-fruit:boats-v1';
const SAVE_VERSION = 1;

interface ProgressionSaveEnvelope {
  version: number;
  progression: ProgressionState;
}

const CATEGORIES: LoadoutCategory[] = ['style', 'sword', 'gun', 'fruit', 'utility'];

export function createDefaultProgressionState(coins = 0): ProgressionState {
  return {
    player: {
      level: 1,
      exp: 0,
      statPoints: 0,
      stats: { combat: 1, vitality: 1, blade: 1, ranged: 1, fruitPower: 1, mana: 1 },
    },
    mastery: {
      'basic-brawl': { itemId: 'basic-brawl', category: 'style', level: 1, exp: 0 },
      'training-sword': {
        itemId: 'training-sword',
        category: 'sword',
        level: 1,
        exp: 0,
      },
    },
    coins: Math.max(0, Math.floor(coins)),
    completedQuestIds: [],
    activeQuestId: null,
    activeQuestProgress: [],
  };
}

function finiteInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function sanitizeStats(value: unknown): PlayerStats {
  const stats = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    combat: finiteInt(stats.combat, 1, 1, PROGRESSION_CONFIG.maxStatPerCategory),
    vitality: finiteInt(stats.vitality, 1, 1, PROGRESSION_CONFIG.maxStatPerCategory),
    blade: finiteInt(stats.blade, 1, 1, PROGRESSION_CONFIG.maxStatPerCategory),
    ranged: finiteInt(stats.ranged, 1, 1, PROGRESSION_CONFIG.maxStatPerCategory),
    fruitPower: finiteInt(stats.fruitPower, 1, 1, PROGRESSION_CONFIG.maxStatPerCategory),
    mana: finiteInt(stats.mana, 1, 1, PROGRESSION_CONFIG.maxStatPerCategory),
  };
}

function sanitizeMastery(value: unknown): Record<string, MasteryEntry> {
  const defaults = createDefaultProgressionState().mastery;
  if (!value || typeof value !== 'object') return defaults;
  const result: Record<string, MasteryEntry> = { ...defaults };
  for (const [itemId, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!itemId || !raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;
    const category = CATEGORIES.includes(entry.category as LoadoutCategory)
      ? (entry.category as LoadoutCategory)
      : null;
    if (!category) continue;
    result[itemId] = {
      itemId,
      category,
      level: finiteInt(entry.level, 1, 1, PROGRESSION_CONFIG.masteryMaxLevel),
      exp: finiteInt(entry.exp, 0, 0, Number.MAX_SAFE_INTEGER),
    };
  }
  return result;
}

export function sanitizeProgressionState(value: unknown, legacyCoins = 0): ProgressionState {
  const state = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const player = state.player && typeof state.player === 'object'
    ? (state.player as Record<string, unknown>)
    : {};
  const defaultState = createDefaultProgressionState(legacyCoins);
  const activeQuestId = typeof state.activeQuestId === 'string' ? state.activeQuestId : null;
  const level = finiteInt(player.level, 1, 1, PROGRESSION_CONFIG.maxLevel);
  return {
    player: {
      level,
      exp: level >= PROGRESSION_CONFIG.maxLevel
        ? 0
        : finiteInt(player.exp, 0, 0, Number.MAX_SAFE_INTEGER),
      statPoints: finiteInt(player.statPoints, 0, 0, Number.MAX_SAFE_INTEGER),
      stats: sanitizeStats(player.stats),
    },
    mastery: sanitizeMastery(state.mastery),
    coins: finiteInt(state.coins, defaultState.coins, 0, Number.MAX_SAFE_INTEGER),
    completedQuestIds: Array.isArray(state.completedQuestIds)
      ? [...new Set(state.completedQuestIds.filter((id): id is string => typeof id === 'string'))]
      : [],
    activeQuestId,
    activeQuestProgress:
      activeQuestId && Array.isArray(state.activeQuestProgress)
        ? state.activeQuestProgress.map((count) => finiteInt(count, 0, 0, Number.MAX_SAFE_INTEGER))
        : [],
  };
}

export function readLegacyBoatCoins(storage: StorageLike | null): number {
  if (!storage) return 0;
  try {
    const raw = storage.getItem(LEGACY_BOAT_STORAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { coins?: unknown };
    return finiteInt(parsed.coins, 0, 0, Number.MAX_SAFE_INTEGER);
  } catch {
    return 0;
  }
}

export function loadProgression(storage: StorageLike | null): ProgressionState {
  const legacyCoins = readLegacyBoatCoins(storage);
  if (!storage) return createDefaultProgressionState(legacyCoins);
  try {
    const raw = storage.getItem(PROGRESSION_STORAGE_KEY);
    if (!raw) return createDefaultProgressionState(legacyCoins);
    const parsed = JSON.parse(raw) as Partial<ProgressionSaveEnvelope> & Record<string, unknown>;
    // รองรับทั้ง envelope ปัจจุบันและ prototype ที่เคยบันทึก state ตรง ๆ
    return sanitizeProgressionState(parsed.progression ?? parsed, legacyCoins);
  } catch {
    return createDefaultProgressionState(legacyCoins);
  }
}

export function saveProgression(storage: StorageLike | null, state: ProgressionState): void {
  if (!storage) return;
  const envelope: ProgressionSaveEnvelope = {
    version: SAVE_VERSION,
    progression: sanitizeProgressionState(state),
  };
  storage.setItem(PROGRESSION_STORAGE_KEY, JSON.stringify(envelope));
}

export function browserStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}
