import type { EconomyCellId, EconomyWorldState, TradeRouteState } from './types';
import { DYNAMIC_TRADE } from './DynamicTradeConfig';
import { ECONOMY_CONFIG } from './LivingTradeConfig';

export function orderDedupKey(
  sourceId: EconomyCellId,
  destId: EconomyCellId,
  commodityId: string,
): string {
  return `${sourceId}:${destId}:${commodityId}`;
}

export function findRoute(
  world: EconomyWorldState,
  sourceId: EconomyCellId,
  destId: EconomyCellId,
): TradeRouteState | undefined {
  return world.routes.find(
    (r) => r.sourceCellId === sourceId && r.targetCellId === destId,
  );
}

/** ย้าย route เก่า (v3) ให้มีฟิลด์ E2 */
export function migrateRoute(route: TradeRouteState): TradeRouteState {
  const ticks = route.travelTicks ?? ECONOMY_CONFIG.baseTransportTicks;
  return {
    ...route,
    distance: route.distance ?? ticks * 10,
    travelTicks: ticks,
    transportCost: route.transportCost ?? 5,
    danger: route.danger ?? DYNAMIC_TRADE.baseRouteDanger,
    traffic: route.traffic ?? 0,
    capacity: route.capacity ?? 4,
    successfulTrips: route.successfulTrips ?? 0,
    failedTrips: route.failedTrips ?? 0,
  };
}

export function migrateAllRoutes(routes: TradeRouteState[]): TradeRouteState[] {
  return routes.map(migrateRoute);
}
