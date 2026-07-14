import type {
  CommodityDefinition,
  IslandMarketDefinition,
  IslandMarketEntry,
  TradeRouteDefinition,
  TradeVendorDefinition,
} from './types';
import type { IslandId } from '../island/IslandTypes';
import {
  ISLAND_MARKETS,
  TRADE_COMMODITIES,
  TRADE_ROUTES,
  TRADE_RULES,
  TRADE_SYSTEM_CONFIG,
  TRADE_VENDORS,
  BOAT_CARGO_CAPACITY,
} from './databook';

export {
  BOAT_CARGO_CAPACITY,
  ISLAND_MARKETS,
  TRADE_COMMODITIES,
  TRADE_ROUTES,
  TRADE_RULES,
  TRADE_SYSTEM_CONFIG,
  TRADE_VENDORS,
};

export function getCommodity(id: string): CommodityDefinition | undefined {
  return TRADE_COMMODITIES.find((c) => c.id === id);
}

export function getIslandMarket(id: string): IslandMarketDefinition | undefined {
  return ISLAND_MARKETS.find((m) => m.id === id);
}

export function getMarketForIsland(islandId: IslandId): IslandMarketDefinition | undefined {
  return ISLAND_MARKETS.find((m) => m.islandId === islandId);
}

export function getMarketEntry(
  marketId: string,
  commodityId: string,
): IslandMarketEntry | undefined {
  return getIslandMarket(marketId)?.entries.find((e) => e.commodityId === commodityId);
}

export function getTradeRoute(id: string): TradeRouteDefinition | undefined {
  return TRADE_ROUTES.find((r) => r.id === id);
}

export function listRoutesFromIsland(islandId: IslandId): TradeRouteDefinition[] {
  return TRADE_ROUTES.filter((r) => r.fromIslandId === islandId);
}

export function getTradeVendor(id: string): TradeVendorDefinition | undefined {
  return TRADE_VENDORS.find((v) => v.id === id);
}

export function listVendorsOnIsland(islandId: IslandId): TradeVendorDefinition[] {
  return TRADE_VENDORS.filter((v) => v.islandId === islandId);
}

export * from './TradeFormulas';
