import type {
  CommodityReservation,
  EconomyCellId,
  EconomyWorldState,
  LivingCommodityId,
} from './types';
import { COMMODITY_RESERVE, LIVING_COMMODITY_META } from './ProductionRecipes';
import { DYNAMIC_TRADE } from './DynamicTradeConfig';

export function getReserveStock(
  _cellId: EconomyCellId,
  commodityId: LivingCommodityId,
): number {
  return COMMODITY_RESERVE[commodityId]
    ?? LIVING_COMMODITY_META[commodityId].reserveStock
    ?? 0;
}

export function getReservedAmount(
  world: EconomyWorldState,
  cellId: EconomyCellId,
  commodityId: LivingCommodityId,
): number {
  return world.reservations
    .filter((r) => r.cellId === cellId && r.commodityId === commodityId)
    .reduce((sum, r) => sum + r.amount, 0);
}

export function getExportableStock(
  world: EconomyWorldState,
  cellId: EconomyCellId,
  commodityId: LivingCommodityId,
): number {
  const cell = world.cells.find((c) => c.id === cellId);
  const item = cell?.commodities[commodityId];
  if (!item) return 0;
  const reserve = getReserveStock(cellId, commodityId);
  const committed = getReservedAmount(world, cellId, commodityId);
  return Math.max(0, item.stock - reserve - committed);
}

export function reserveStock(
  world: EconomyWorldState,
  reservation: CommodityReservation,
): boolean {
  const available = getExportableStock(world, reservation.cellId, reservation.commodityId);
  if (available < reservation.amount) return false;
  world.reservations.push(reservation);
  return true;
}

export function releaseReservation(
  world: EconomyWorldState,
  orderId: string,
): void {
  world.reservations = world.reservations.filter((r) => r.orderId !== orderId);
}

export function releaseStaleReservations(world: EconomyWorldState): void {
  const timeout = DYNAMIC_TRADE.reservationTimeoutTicks;
  const stale = world.reservations.filter(
    (r) => world.tick - r.reservedAtTick > timeout,
  );
  for (const r of stale) {
    releaseReservation(world, r.orderId);
    const order = world.orders.find((o) => o.id === r.orderId);
    if (order && order.status === 'assigned') {
      order.status = 'open';
      order.assignedTraderId = undefined;
    }
  }
}
