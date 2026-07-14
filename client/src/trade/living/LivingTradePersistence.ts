import type { EconomyWorldState } from './types';
import { createInitialWorld, ECONOMY_CONFIG } from './LivingTradeConfig';
import { ECONOMY_GENOME_CONFIG } from './EconomyGenomeConfig';
import { ensureGenomeState, migrateGenomeFromSave } from './EconomyGenomeInitializer';
import { migrateAllRoutes } from './TradeRouteUtils';
import { ensureFactoryAgents } from './AdaptiveEconomy';
import { ensureTraders } from './DynamicTradeEconomy';
import {
  ensureTraderMemoryState,
  migrateRouteReputationsFromRoutes,
} from './TraderMemoryStore';
import { createDefaultPlayerEconomy } from './PlayerEconomyHistory';

const STORAGE_KEY = 'pirate-fruit:economy-v1';
const SAVE_VERSION = ECONOMY_GENOME_CONFIG.saveVersion;

interface SavedEconomy {
  version: number;
  world: EconomyWorldState;
}

function ensurePlayerEconomyState(world: EconomyWorldState): void {
  world.playerEconomy ??= createDefaultPlayerEconomy();
  const pe = world.playerEconomy;
  pe.activityWindows ??= [];
  pe.availableContracts ??= [];
  pe.activeContracts ??= [];
  pe.contractHistory ??= [];
  pe.tradeHistory ??= [];
  pe.worldRecords ??= createDefaultPlayerEconomy().worldRecords;
  if (pe.trackedContractId === undefined) pe.trackedContractId = null;
}

function migrateWorld(world: EconomyWorldState, fromVersion: number): EconomyWorldState {
  for (const cell of world.cells) {
    cell.availableWorkforce ??= 0;
    cell.unemployment ??= Math.floor(cell.population * 0.08);
    cell.wageLevel ??= 10;
  }
  world.factories ??= [];
  ensureFactoryAgents(world);
  world.routes = migrateAllRoutes(world.routes ?? []);
  world.orders ??= [];
  world.reservations ??= [];
  world.orderGenCooldowns ??= {};
  ensureTraders(world);
  ensureTraderMemoryState(world);
  if (!world.traderProfiles?.length) {
    migrateRouteReputationsFromRoutes(world);
  }
  ensurePlayerEconomyState(world);
  if (fromVersion < SAVE_VERSION) {
    migrateGenomeFromSave(world);
  } else {
    ensureGenomeState(world);
  }
  return world;
}

export function loadEconomyState(): EconomyWorldState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedEconomy;
    if (!saved.world?.cells?.length) return null;
    if (saved.version !== SAVE_VERSION
      && saved.version !== 2
      && saved.version !== 3
      && saved.version !== 4
      && saved.version !== 5
      && saved.version !== 6) return null;
    const world = migrateWorld(saved.world, saved.version);
    world.npcCargoCapacityMultiplier ??= 1;
    world.spoilageReduction ??= 0;
    return world;
  } catch {
    return null;
  }
}

export function saveEconomyState(world: EconomyWorldState): void {
  try {
    ensurePlayerEconomyState(world);
    ensureGenomeState(world);
    const payload: SavedEconomy = { version: SAVE_VERSION, world };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

export function createFreshWorld(): EconomyWorldState {
  const { cells, routes } = createInitialWorld();
  const world: EconomyWorldState = {
    tick: 0,
    cells,
    routes: migrateAllRoutes(routes),
    ships: [],
    news: [],
    log: [],
    factories: [],
    orders: [],
    traders: [],
    reservations: [],
    orderGenCooldowns: {},
    npcCooldown: ECONOMY_CONFIG.npcDepartEveryTicks,
    npcCargoCapacityMultiplier: 1,
    spoilageReduction: 0,
    traderProfiles: [],
    traderRouteMemories: [],
    avoidedRoutes: [],
    routeReputations: [],
    traderRngSeed: 42_424,
    playerEconomy: createDefaultPlayerEconomy(),
  };
  ensureFactoryAgents(world);
  ensureTraders(world);
  ensureTraderMemoryState(world);
  migrateRouteReputationsFromRoutes(world);
  ensureGenomeState(world);
  return world;
}
