import type {
  CargoShip,
  DynamicTradeOrder,
  EconomyLogEntry,
  EconomyWorldState,
  TraderAgentState,
} from './types';
import { DYNAMIC_TRADE } from './DynamicTradeConfig';
import { ECONOMY_CONFIG, CELL_LABELS } from './LivingTradeConfig';
import { LIVING_COMMODITY_META } from './ProductionRecipes';
import { findRoute } from './TradeRouteUtils';
import {
  expireTradeOrders,
  generateTradeOrders,
} from './TradeOrderGenerator';
import { pickBestOrderForTrader } from './TraderDecision';
import {
  getExportableStock,
  releaseReservation,
  releaseStaleReservations,
  reserveStock,
} from './TradeStockReservation';

let shipCounter = 0;

export function resetShipCounter(): void {
  shipCounter = 0;
}

export function createDefaultTraders(): TraderAgentState[] {
  return [
    {
      id: 'trader-leaf-safe',
      cellId: 'leaf-island',
      nameTh: 'พ่อค้าใบไม้ (ระมัดระวัง)',
      riskTolerance: 0.3,
      cargoCapacity: ECONOMY_CONFIG.npcCargoMax,
      cooldown: 0,
      totalProfit: 0,
    },
    {
      id: 'trader-mine-bal',
      cellId: 'mine-island',
      nameTh: 'พ่อค้าเหมือง',
      riskTolerance: 0.55,
      cargoCapacity: ECONOMY_CONFIG.npcCargoMax,
      cooldown: 0,
      totalProfit: 0,
    },
    {
      id: 'trader-cloth-bold',
      cellId: 'cloth-island',
      nameTh: 'พ่อค้าทอผ้า (เสี่ยง)',
      riskTolerance: 0.88,
      cargoCapacity: ECONOMY_CONFIG.npcCargoMax + 2,
      cooldown: 0,
      totalProfit: 0,
    },
    {
      id: 'trader-yard',
      cellId: 'shipyard-island',
      nameTh: 'พ่อค้าอู่เรือ',
      riskTolerance: 0.45,
      cargoCapacity: ECONOMY_CONFIG.npcCargoMax + 2,
      cooldown: 0,
      totalProfit: 0,
    },
    {
      id: 'trader-roamer',
      cellId: 'leaf-island',
      nameTh: 'เรือค้าเร่า',
      riskTolerance: 0.72,
      cargoCapacity: ECONOMY_CONFIG.npcCargoMax + 4,
      cooldown: 0,
      totalProfit: 0,
    },
  ];
}

export function ensureTraders(world: EconomyWorldState): void {
  if (!world.traders?.length) {
    world.traders = createDefaultTraders();
  }
  world.orders ??= [];
  world.reservations ??= [];
  world.orderGenCooldowns ??= {};
}

export interface DynamicTradeTickResult {
  newOrders: DynamicTradeOrder[];
  assigned: DynamicTradeOrder[];
  departed: CargoShip[];
  highProfitRoutes: DynamicTradeOrder[];
  criticalShortages: string[];
}

export function updateDynamicTradeEconomy(
  world: EconomyWorldState,
  log: EconomyLogEntry[],
  options: { allowDepart?: boolean } = {},
): DynamicTradeTickResult {
  const { allowDepart = true } = options;
  ensureTraders(world);
  releaseStaleReservations(world);
  expireTradeOrders(world, log);

  const newOrders = generateTradeOrders(world, log);
  const assigned: DynamicTradeOrder[] = [];
  const highProfitRoutes: DynamicTradeOrder[] = [];

  for (const trader of world.traders) {
    if (trader.cooldown > 0) {
      trader.cooldown -= 1;
      continue;
    }
    if (trader.activeOrderId) continue;

    const pick = pickBestOrderForTrader(
      trader,
      world.orders,
      world,
      DYNAMIC_TRADE.maxOrderAmountPerTick,
    );
    if (!pick) continue;

    const exportable = getExportableStock(
      world,
      pick.order.sourceIslandId,
      pick.order.commodityId,
    );
    const amount = Math.min(pick.amount, exportable);
    if (amount < 3) continue;

    const reserved = reserveStock(world, {
      cellId: pick.order.sourceIslandId,
      commodityId: pick.order.commodityId,
      amount,
      orderId: pick.order.id,
      reservedAtTick: world.tick,
    });
    if (!reserved) continue;

    pick.order.status = 'assigned';
    pick.order.assignedTraderId = trader.id;
    pick.order.remainingAmount = amount;
    trader.activeOrderId = pick.order.id;
    assigned.push(pick.order);

    log.push({
      tick: world.tick,
      message: `${trader.nameTh}รับคำสั่งขนส่ง${LIVING_COMMODITY_META[pick.order.commodityId].label}`,
      cellId: pick.order.sourceIslandId,
      commodityId: pick.order.commodityId,
    });

    if (pick.order.expectedProfit >= DYNAMIC_TRADE.highProfitToastThreshold) {
      highProfitRoutes.push(pick.order);
    }
  }

  const departed = allowDepart ? departAssignedOrders(world, log) : [];
  const criticalShortages = detectCriticalUnassignedShortages(world);

  return { newOrders, assigned, departed, highProfitRoutes, criticalShortages };
}

function departAssignedOrders(
  world: EconomyWorldState,
  log: EconomyLogEntry[],
): CargoShip[] {
  const ships: CargoShip[] = [];

  for (const order of world.orders) {
    if (order.status !== 'assigned') continue;

    const origin = world.cells.find((c) => c.id === order.sourceIslandId);
    if (!origin) continue;

    const capacity = origin.transportCapacity * world.npcCargoCapacityMultiplier;
    const shipsFromOrigin = world.ships.filter((s) => s.originCellId === origin.id).length;
    if (shipsFromOrigin >= capacity) continue;

    const item = origin.commodities[order.commodityId];
    if (!item) continue;

    const amount = order.remainingAmount;
    item.stock = Math.max(0, item.stock - amount);
    releaseReservation(world, order.id);

    order.status = 'in-transit';
    const route = findRoute(world, order.sourceIslandId, order.destinationIslandId);
    const travelTicks = route?.travelTicks ?? ECONOMY_CONFIG.baseTransportTicks;

    shipCounter += 1;
    const ship: CargoShip = {
      id: `cargo-${shipCounter}`,
      originCellId: order.sourceIslandId,
      destinationCellId: order.destinationIslandId,
      cargo: { [order.commodityId]: amount },
      travelTimeRemaining: travelTicks,
      orderId: order.id,
      traderId: order.assignedTraderId,
    };
    ships.push(ship);

    log.push({
      tick: world.tick,
      message: `เรือโหลด${LIVING_COMMODITY_META[order.commodityId].label} ${amount} หน่วยจาก${CELL_LABELS[order.sourceIslandId]}`,
      cellId: order.sourceIslandId,
      commodityId: order.commodityId,
    });
  }

  world.ships.push(...ships);
  return ships;
}

function detectCriticalUnassignedShortages(world: EconomyWorldState): string[] {
  const warnings: string[] = [];
  for (const cell of world.cells) {
    for (const [id, item] of Object.entries(cell.commodities)) {
      if (!item) continue;
      const ratio = item.stock / Math.max(item.targetStock, 1);
      if (ratio > DYNAMIC_TRADE.crisisThreshold) continue;
      const hasOpen = world.orders.some(
        (o) => o.destinationIslandId === cell.id
          && o.commodityId === id
          && (o.status === 'open' || o.status === 'assigned' || o.status === 'in-transit'),
      );
      if (!hasOpen) {
        warnings.push(`${cell.nameTh}ขาด${LIVING_COMMODITY_META[id as keyof typeof LIVING_COMMODITY_META].label}ไม่มีพ่อค้ารับส่ง`);
      }
    }
  }
  return warnings;
}

export function completeTradeShipment(
  world: EconomyWorldState,
  order: DynamicTradeOrder,
  deliveredAmount: number,
  log: EconomyLogEntry[],
): void {
  const dest = world.cells.find((c) => c.id === order.destinationIslandId);
  if (dest) {
    const item = dest.commodities[order.commodityId];
    if (item) {
      item.stock += deliveredAmount;
      item.memory.recentSellVolume += deliveredAmount * 0.5;
      item.importDemand += deliveredAmount * 0.15;
    }
  }

  const route = findRoute(world, order.sourceIslandId, order.destinationIslandId);
  if (route) {
    route.successfulTrips = (route.successfulTrips ?? 0) + 1;
    route.traffic = (route.traffic ?? 0) + 0.2;
  }

  const trader = world.traders.find((t) => t.id === order.assignedTraderId);
  if (trader) {
    const profitShare = order.expectedProfit * (deliveredAmount / Math.max(order.requestedAmount, 1));
    trader.totalProfit += profitShare;
    trader.activeOrderId = undefined;
    trader.cooldown = 1;
  }

  order.status = 'completed';
  order.remainingAmount = 0;

  if (dest) {
    log.push({
      tick: world.tick,
      message: `ส่งมอบ${LIVING_COMMODITY_META[order.commodityId].label} ${deliveredAmount} หน่วยถึง${dest.nameTh}`,
      cellId: order.destinationIslandId,
      commodityId: order.commodityId,
    });
  }
}

export function failTradeShipment(
  world: EconomyWorldState,
  orderId: string,
  log: EconomyLogEntry[],
  loseCargo: boolean,
): boolean {
  const order = world.orders.find((o) => o.id === orderId);
  if (!order || order.status !== 'in-transit') return false;

  releaseReservation(world, order.id);
  order.status = 'failed';

  const route = findRoute(world, order.sourceIslandId, order.destinationIslandId);
  if (route) {
    route.failedTrips = (route.failedTrips ?? 0) + 1;
    route.danger = Math.min(
      1,
      (route.danger ?? DYNAMIC_TRADE.baseRouteDanger) + DYNAMIC_TRADE.routeDangerPerFailure,
    );
  }

  const trader = world.traders.find((t) => t.id === order.assignedTraderId);
  if (trader) {
    trader.activeOrderId = undefined;
    trader.cooldown = 2;
  }

  log.push({
    tick: world.tick,
    message: loseCargo
      ? `เรือขนส่ง${LIVING_COMMODITY_META[order.commodityId].label}ถูกทำลาย — สินค้าสูญหาย`
      : `คำสั่งขนส่ง${LIVING_COMMODITY_META[order.commodityId].label}ล้มเหลว`,
    cellId: order.destinationIslandId,
    commodityId: order.commodityId,
  });
  return true;
}

/** Debug — บังคับ shortage */
export function debugForceShortage(
  world: EconomyWorldState,
  cellId: import('./types').EconomyCellId,
  commodityId: import('./types').LivingCommodityId,
  amount: number,
): void {
  const cell = world.cells.find((c) => c.id === cellId);
  const item = cell?.commodities[commodityId];
  if (!item) return;
  item.stock = Math.max(0, item.stock - amount);
}

/** Debug — บังคับ surplus */
export function debugForceSurplus(
  world: EconomyWorldState,
  cellId: import('./types').EconomyCellId,
  commodityId: import('./types').LivingCommodityId,
  amount: number,
): void {
  const cell = world.cells.find((c) => c.id === cellId);
  const item = cell?.commodities[commodityId];
  if (!item) return;
  item.stock += amount;
}

export function debugClearOrders(world: EconomyWorldState): void {
  for (const order of world.orders) {
    if (order.status === 'assigned') releaseReservation(world, order.id);
  }
  world.orders = [];
  world.reservations = [];
  for (const trader of world.traders) trader.activeOrderId = undefined;
}

export function debugAssignBestOrder(world: EconomyWorldState, log: EconomyLogEntry[]): boolean {
  for (const trader of world.traders) {
    if (trader.activeOrderId) continue;
    const pick = pickBestOrderForTrader(trader, world.orders, world, DYNAMIC_TRADE.maxOrderAmountPerTick);
    if (!pick) continue;
    const amount = Math.min(pick.amount, getExportableStock(world, pick.order.sourceIslandId, pick.order.commodityId));
    if (amount < 3) continue;
    if (!reserveStock(world, {
      cellId: pick.order.sourceIslandId,
      commodityId: pick.order.commodityId,
      amount,
      orderId: pick.order.id,
      reservedAtTick: world.tick,
    })) continue;
    pick.order.status = 'assigned';
    pick.order.assignedTraderId = trader.id;
    pick.order.remainingAmount = amount;
    trader.activeOrderId = pick.order.id;
    log.push({ tick: world.tick, message: `[debug] ${trader.nameTh}รับคำสั่ง`, cellId: pick.order.sourceIslandId });
    return true;
  }
  return false;
}

export function debugCompleteFirstInTransit(world: EconomyWorldState, _log: EconomyLogEntry[]): boolean {
  const ship = world.ships.find((s) => s.orderId);
  if (!ship || !ship.orderId) return false;
  ship.travelTimeRemaining = 0;
  return true;
}

export function debugFailFirstInTransit(world: EconomyWorldState, log: EconomyLogEntry[]): boolean {
  const ship = world.ships.find((s) => s.orderId);
  if (!ship?.orderId) return false;
  world.ships = world.ships.filter((s) => s.id !== ship.id);
  return failTradeShipment(world, ship.orderId, log, true);
}
