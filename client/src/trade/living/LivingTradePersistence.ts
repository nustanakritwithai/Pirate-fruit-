import type { EconomyCellId, EconomyWorldState, LivingCommodityId } from './types';
import {
  cellForCommodity,
  createInitialWorld,
  ECONOMY_CONFIG,
  ensureCommodityCoverage,
  ensureEssentialLocalProduction,
  essentialRecoveryStock,
  isEssentialCommodity,
} from './LivingTradeConfig';
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
import { trimEconomyWorldState } from './LivingEconomyBounds';

const STORAGE_KEY = 'pirate-fruit:economy-v1';
const SAVE_VERSION = ECONOMY_GENOME_CONFIG.saveVersion;
const ECONOMY_BALANCE_VERSION = 3;

const INDUSTRIAL_RECOVERY_RATIO: Partial<Record<LivingCommodityId, number>> = {
  'iron-ore': 0.9,
  tools: 0.7,
  'sun-silk': 0.9,
  rope: 0.75,
  'luxury-cloth': 0.5,
  'healing-herb': 0.9,
  'herbal-medicine': 0.65,
  sailcloth: 0.65,
  'repair-kit': 0.6,
  'trade-crate': 0.6,
};

interface SavedEconomy {
  version: number;
  world: EconomyWorldState;
}

function industrialRecoveryStock(
  cellId: EconomyCellId,
  commodityId: LivingCommodityId,
  targetStock: number,
): number {
  const producerRatio = INDUSTRIAL_RECOVERY_RATIO[commodityId];
  if (!producerRatio) return 0;
  const ratio = cellForCommodity(commodityId) === cellId ? producerRatio : 0.18;
  return targetStock * ratio;
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

/** กู้ save เดิมที่โรงงานหลายหน่วยทำให้วัตถุดิบและอาหารลดลงจนระบบขนส่งหยุดทั้งเครือข่าย */
function recoverCollapsedEconomy(world: EconomyWorldState): void {
  const previousBalanceVersion = world.economyBalanceVersion ?? 0;
  if (previousBalanceVersion >= ECONOMY_BALANCE_VERSION) return;

  world.ships ??= [];
  world.orders ??= [];
  world.reservations ??= [];
  world.traders ??= [];

  for (const cell of world.cells) {
    for (const [commodityId, item] of Object.entries(cell.commodities)) {
      if (!item) continue;
      const id = commodityId as LivingCommodityId;
      const legacyRecovery = previousBalanceVersion < 1
        ? item.targetStock * (item.baseProduction > 0 ? 1.35 : 0.25)
        : 0;
      const essentialRecovery = isEssentialCommodity(id)
        ? essentialRecoveryStock(id, item.targetStock)
        : 0;
      const industrialRecovery = previousBalanceVersion < 3
        ? industrialRecoveryStock(cell.id, id, item.targetStock)
        : 0;
      item.stock = Math.max(
        item.stock,
        Math.ceil(legacyRecovery),
        Math.ceil(essentialRecovery),
        Math.ceil(industrialRecovery),
      );
      item.production = item.baseProduction;
      if (legacyRecovery > 0 || essentialRecovery > 0 || industrialRecovery > 0) {
        item.marketState = 'balanced';
        item.trend = 'stable';
      }
    }
  }

  if (previousBalanceVersion < 1) {
    // ปลดงานค้างที่ไม่มีเรือแล้ว เพื่อให้กองเรือเริ่มรับคำสั่งใหม่ทันที
    const inTransitOrderIds = new Set(
      world.ships.map((ship) => ship.orderId).filter((id): id is string => Boolean(id)),
    );
    world.orders = world.orders.filter((order) =>
      order.status === 'in-transit' && inTransitOrderIds.has(order.id));
    world.reservations = world.reservations.filter((reservation) =>
      inTransitOrderIds.has(reservation.orderId));
    for (const trader of world.traders) trader.activeOrderId = undefined;
    world.orderGenCooldowns = {};
  }
  world.npcCooldown = 0;
  world.economyBalanceVersion = ECONOMY_BALANCE_VERSION;
}

/** เติมเซลล์/สินค้า/เส้นทางของเกาะที่เพิ่มภายหลัง โดยรักษาสต็อกและประวัติเซฟเดิม */
function mergeCurrentTradeNetwork(world: EconomyWorldState): void {
  const seed = createInitialWorld();
  const existingById = new Map(world.cells.map((cell) => [cell.id, cell]));

  for (const seedCell of seed.cells) {
    const existing = existingById.get(seedCell.id);
    if (!existing) {
      world.cells.push(seedCell);
      existingById.set(seedCell.id, seedCell);
      continue;
    }
    existing.gameIslandId ??= seedCell.gameIslandId;
    existing.role ??= seedCell.role;
    existing.nameTh ||= seedCell.nameTh;
    existing.productionUnits = Math.max(existing.productionUnits ?? 1, seedCell.productionUnits);
    existing.transportCapacity = Math.max(existing.transportCapacity ?? 1, seedCell.transportCapacity);
    existing.commodities = { ...seedCell.commodities, ...existing.commodities };
  }
  ensureCommodityCoverage(world.cells);
  ensureEssentialLocalProduction(world.cells);
  recoverCollapsedEconomy(world);

  // เชื่อมเครือข่ายเป็น full mesh เพื่อให้เรือ supply ไปถึงเกาะปลายทางได้เสมอ
  const allIds = world.cells.map((cell) => cell.id);
  for (const cell of world.cells) {
    cell.neighbors = allIds.filter((id) => id !== cell.id);
  }

  const routeKeys = new Set(
    (world.routes ?? []).map((route) => `${route.sourceCellId}:${route.targetCellId}`),
  );
  for (const route of seed.routes) {
    const key = `${route.sourceCellId}:${route.targetCellId}`;
    if (!routeKeys.has(key)) {
      world.routes.push(route);
      routeKeys.add(key);
    }
  }
}

function migrateWorld(world: EconomyWorldState, fromVersion: number): EconomyWorldState {
  world.routes ??= [];
  world.ships ??= [];
  mergeCurrentTradeNetwork(world);
  for (const cell of world.cells) {
    cell.productionUnits ??= 1;
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
      && saved.version !== 6
      && saved.version !== 7) return null;
    const world = migrateWorld(saved.world, saved.version);
    world.npcCargoCapacityMultiplier ??= 1;
    world.spoilageReduction ??= 0;
    trimEconomyWorldState(world);
    return world;
  } catch {
    return null;
  }
}

export function saveEconomyState(world: EconomyWorldState): void {
  try {
    ensurePlayerEconomyState(world);
    ensureGenomeState(world);
    trimEconomyWorldState(world);
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
    economyBalanceVersion: ECONOMY_BALANCE_VERSION,
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
