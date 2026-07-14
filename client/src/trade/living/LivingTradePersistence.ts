import type { EconomyWorldState } from './types';
import { createInitialWorld, ECONOMY_CONFIG } from './LivingTradeConfig';

const STORAGE_KEY = 'pirate-fruit:economy-v1';
const SAVE_VERSION = 1;

interface SavedEconomy {
  version: number;
  world: EconomyWorldState;
}

export function loadEconomyState(): EconomyWorldState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedEconomy;
    if (saved.version !== SAVE_VERSION || !saved.world?.cells?.length) return null;
    return saved.world;
  } catch {
    return null;
  }
}

export function saveEconomyState(world: EconomyWorldState): void {
  try {
    const payload: SavedEconomy = { version: SAVE_VERSION, world };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function createFreshWorld(): EconomyWorldState {
  const { cells, routes } = createInitialWorld();
  return {
    tick: 0,
    cells,
    routes,
    ships: [],
    news: [],
    log: [],
    npcCooldown: ECONOMY_CONFIG.npcDepartEveryTicks,
  };
}
