import type {
  DynamicTradeOrder,
  EconomyCellId,
  EconomyLogEntry,
  EconomyWorldState,
  LivingCommodityId,
} from './types';
import { DYNAMIC_TRADE } from './DynamicTradeConfig';
import { ECONOMY_CONFIG } from './LivingTradeConfig';
import { livingBuyPrice, livingSellPrice, stockRatio } from './LivingTradeFormulas';
import { updatePrices } from './EconomyRules';
import { LIVING_COMMODITY_META } from './ProductionRecipes';
import { findRoute, orderDedupKey } from './TradeRouteUtils';
import { getExportableStock, getReserveStock } from './TradeStockReservation';

let orderCounter = 0;

function nextOrderId(): string {
  orderCounter += 1;
  return `order-${orderCounter}`;
}

export function resetOrderCounter(): void {
  orderCounter = 0;
}

function isActiveOrder(order: DynamicTradeOrder): boolean {
  return order.status === 'open' || order.status === 'assigned' || order.status === 'in-transit';
}

function urgencyForRatio(ratio: number): number {
  if (ratio >= DYNAMIC_TRADE.shortageThreshold) return 0;
  if (ratio <= DYNAMIC_TRADE.crisisThreshold) return 1;
  const span = DYNAMIC_TRADE.shortageThreshold - DYNAMIC_TRADE.crisisThreshold;
  return 0.5 + ((DYNAMIC_TRADE.shortageThreshold - ratio) / span) * 0.5;
}

function importNeedAmount(item: import('./types').CommodityState): number {
  const ratio = stockRatio(item);
  if (ratio >= DYNAMIC_TRADE.shortageThreshold) return 0;
  const targetFill = item.targetStock * DYNAMIC_TRADE.shortageThreshold - item.stock;
  return Math.max(0, Math.ceil(targetFill));
}

function computeOrderEconomics(
  world: EconomyWorldState,
  sourceId: EconomyCellId,
  destId: EconomyCellId,
  commodityId: LivingCommodityId,
  amount: number,
  urgency: number,
): Omit<DynamicTradeOrder, 'id' | 'status' | 'createdTick' | 'expiresAtTick' | 'assignedTraderId'> | null {
  const source = world.cells.find((c) => c.id === sourceId);
  const dest = world.cells.find((c) => c.id === destId);
  const route = findRoute(world, sourceId, destId);
  if (!source || !dest || !route) return null;

  const sItem = source.commodities[commodityId];
  const dItem = dest.commodities[commodityId];
  if (!sItem || !dItem || amount <= 0) return null;

  const sourceBuyPrice = livingBuyPrice(sItem);
  const destinationSellPrice = livingSellPrice(dItem);
  const purchaseCost = sourceBuyPrice * amount;
  const expectedRevenue = destinationSellPrice * amount;
  const transportCost = route.transportCost * Math.ceil(amount / 4);
  const danger = route.danger ?? DYNAMIC_TRADE.baseRouteDanger;
  const riskCost = danger * amount * 8 * DYNAMIC_TRADE.riskWeight;
  const spoilageCost = sItem.perishable
    ? amount * sourceBuyPrice * ECONOMY_CONFIG.transitSpoilageRate * (1 - world.spoilageReduction)
    : 0;
  const expectedProfit = expectedRevenue - purchaseCost - transportCost - riskCost - spoilageCost;
  const profitPerCargoSlot = expectedProfit / amount;

  if (expectedProfit < DYNAMIC_TRADE.minimumExpectedProfit) return null;
  if (profitPerCargoSlot < DYNAMIC_TRADE.minimumProfitPerSlot) return null;

  return {
    commodityId,
    sourceIslandId: sourceId,
    destinationIslandId: destId,
    requestedAmount: amount,
    remainingAmount: amount,
    sourceBuyPrice,
    destinationSellPrice,
    expectedRevenue,
    purchaseCost,
    transportCost,
    riskCost,
    spoilageCost,
    expectedProfit,
    profitPerCargoSlot,
    urgency,
    travelTicks: route.travelTicks,
  };
}

function canCreateOrderAtDest(world: EconomyWorldState, destId: EconomyCellId): boolean {
  const openAtDest = world.orders.filter(
    (o) => o.destinationIslandId === destId && isActiveOrder(o),
  ).length;
  return openAtDest < DYNAMIC_TRADE.maxOpenOrdersPerIsland;
}

function canCreateOrderForCommodity(world: EconomyWorldState, commodityId: LivingCommodityId): boolean {
  const open = world.orders.filter(
    (o) => o.commodityId === commodityId && isActiveOrder(o),
  ).length;
  return open < DYNAMIC_TRADE.maxOpenOrdersPerCommodity;
}

function findBestSource(
  world: EconomyWorldState,
  destId: EconomyCellId,
  commodityId: LivingCommodityId,
  need: number,
): { sourceId: EconomyCellId; amount: number } | null {
  let best: { sourceId: EconomyCellId; amount: number; score: number } | null = null;

  for (const cell of world.cells) {
    if (cell.id === destId) continue;
    const item = cell.commodities[commodityId];
    if (!item) continue;

    const reserve = getReserveStock(cell.id, commodityId);
    const surplusThreshold = item.targetStock * DYNAMIC_TRADE.exportSurplusThreshold + reserve;
    if (item.stock <= surplusThreshold) continue;

    const exportable = getExportableStock(world, cell.id, commodityId);
    if (exportable < 3) continue;

    const route = findRoute(world, cell.id, destId);
    if (!route) continue;

    const amount = Math.min(
      need,
      exportable,
      DYNAMIC_TRADE.maxOrderAmountPerTick,
    );
    if (amount < 3) continue;

    const priceEdge = (world.cells.find((c) => c.id === destId)?.commodities[commodityId]?.currentPrice ?? 0)
      - item.currentPrice;
    const score = exportable + priceEdge * 0.1 - route.travelTicks;

    if (!best || score > best.score) {
      best = { sourceId: cell.id, amount, score };
    }
  }
  return best ? { sourceId: best.sourceId, amount: best.amount } : null;
}

function mergeOrCreateOrder(
  world: EconomyWorldState,
  economics: Omit<DynamicTradeOrder, 'id' | 'status' | 'createdTick' | 'expiresAtTick' | 'assignedTraderId'>,
  log: EconomyLogEntry[],
): DynamicTradeOrder | null {
  const key = orderDedupKey(
    economics.sourceIslandId,
    economics.destinationIslandId,
    economics.commodityId,
  );
  const existing = world.orders.find(
    (o) => orderDedupKey(o.sourceIslandId, o.destinationIslandId, o.commodityId) === key
      && (o.status === 'open' || o.status === 'assigned'),
  );

  if (existing) {
    const add = Math.max(0, economics.requestedAmount - existing.remainingAmount);
    if (add > 0) {
      existing.requestedAmount += add;
      existing.remainingAmount += add;
    }
    existing.urgency = Math.max(existing.urgency, economics.urgency);
    existing.expectedProfit = economics.expectedProfit;
    existing.profitPerCargoSlot = economics.profitPerCargoSlot;
    existing.sourceBuyPrice = economics.sourceBuyPrice;
    existing.destinationSellPrice = economics.destinationSellPrice;
    existing.expiresAtTick = world.tick + DYNAMIC_TRADE.orderExpiryTicks;
    log.push({
      tick: world.tick,
      message: `อัปเดตคำสั่งขนส่ง${LIVING_COMMODITY_META[economics.commodityId].label} → ${economics.remainingAmount} หน่วย`,
      cellId: economics.destinationIslandId,
      commodityId: economics.commodityId,
    });
    return existing;
  }

  const order: DynamicTradeOrder = {
    ...economics,
    id: nextOrderId(),
    status: 'open',
    createdTick: world.tick,
    expiresAtTick: world.tick + DYNAMIC_TRADE.orderExpiryTicks,
  };
  world.orders.push(order);
  log.push({
    tick: world.tick,
    message: `สร้างคำสั่งนำเข้า${LIVING_COMMODITY_META[order.commodityId].label} ${order.remainingAmount} หน่วย`,
    cellId: order.destinationIslandId,
    commodityId: order.commodityId,
  });
  return order;
}

export function generateTradeOrders(
  world: EconomyWorldState,
  log: EconomyLogEntry[],
): DynamicTradeOrder[] {
  const created: DynamicTradeOrder[] = [];

  for (const cell of world.cells) {
    updatePrices(cell);
  }

  for (const cell of world.cells) {
    const cooldown = world.orderGenCooldowns[cell.id] ?? 0;
    if (cooldown > 0) {
      world.orderGenCooldowns[cell.id] = cooldown - 1;
      continue;
    }

    let generatedThisCell = false;

    for (const [commodityId, item] of Object.entries(cell.commodities) as [LivingCommodityId, NonNullable<typeof cell.commodities[LivingCommodityId]>][]) {
      if (!item) continue;
      const need = importNeedAmount(item);
      if (need <= 0) continue;
      if (!canCreateOrderAtDest(world, cell.id)) continue;
      if (!canCreateOrderForCommodity(world, commodityId)) continue;

      const source = findBestSource(world, cell.id, commodityId, need);
      if (!source) continue;

      const urgency = urgencyForRatio(stockRatio(item));
      const economics = computeOrderEconomics(
        world,
        source.sourceId,
        cell.id,
        commodityId,
        source.amount,
        urgency,
      );
      if (!economics) continue;

      const order = mergeOrCreateOrder(world, economics, log);
      if (order) created.push(order);
      generatedThisCell = true;
    }

    if (generatedThisCell) {
      world.orderGenCooldowns[cell.id] = DYNAMIC_TRADE.orderCooldownTicks;
    }
  }

  return created;
}

export function expireTradeOrders(world: EconomyWorldState, log: EconomyLogEntry[]): void {
  for (const order of world.orders) {
    if (order.status !== 'open' && order.status !== 'assigned') continue;
    if (world.tick < order.expiresAtTick) continue;
    order.status = 'expired';
    if (order.assignedTraderId) {
      const trader = world.traders.find((t) => t.id === order.assignedTraderId);
      if (trader) trader.activeOrderId = undefined;
    }
    log.push({
      tick: world.tick,
      message: `คำสั่งขนส่ง${LIVING_COMMODITY_META[order.commodityId].label}หมดอายุ`,
      cellId: order.destinationIslandId,
      commodityId: order.commodityId,
    });
  }
}
