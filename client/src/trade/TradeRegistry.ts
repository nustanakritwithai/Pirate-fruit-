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
import { LIVING_COMMODITY_IDS, isLivingCommodity } from './living/LivingTradeConfig';

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

/** หา market entry บนเกาะ (รองรับหลายตลาดต่อเกาะ เช่น อู่เรือ) */
export function findMarketEntryOnIsland(
  islandId: IslandId,
  commodityId: string,
): { market: IslandMarketDefinition; entry: IslandMarketEntry } | undefined {
  // ให้ตลาดเฉพาะทาง (เช่น อู่เรือ) ชนะ fallback ของตลาดหลักบนเกาะเดียวกัน
  for (const market of ISLAND_MARKETS) {
    if (market.islandId !== islandId) continue;
    const entry = market.entries.find((e) => e.commodityId === commodityId);
    if (entry) return { market, entry };
  }
  const market = getMarketForIsland(islandId);
  if (market && isLivingCommodity(commodityId)) {
    return {
      market,
      entry: {
        commodityId,
        role: 'import',
        buyMultiplier: 1,
        sellMultiplier: 1,
        stockLimit: 50,
      },
    };
  }
  return undefined;
}

/** รายการที่ร้านแสดง — สินค้าท้องถิ่นที่ประกาศไว้ + สินค้านำเข้าที่มีสต็อกจริง */
export function listMarketEntriesForMarket(marketId: string): IslandMarketEntry[] {
  const market = getIslandMarket(marketId);
  if (!market) return [];
  const explicit = [...market.entries];
  const known = new Set(explicit.map((entry) => entry.commodityId));
  const imports = LIVING_COMMODITY_IDS
    .filter((commodityId) => !known.has(commodityId))
    .map((commodityId) => ({
      commodityId,
      role: 'import' as const,
      buyMultiplier: 1,
      sellMultiplier: 1,
      stockLimit: 50,
    }));
  return [...explicit, ...imports];
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
