import type { IslandId } from '../../island/IslandTypes';
import type { CommodityState, LivingCommodityId, TradeIslandState, TradeRouteState } from './types';

export const LIVING_COMMODITY_IDS: readonly LivingCommodityId[] = [
  'fresh-fish',
  'hardwood',
  'iron-ore',
  'sun-silk',
] as const;

export const LIVING_TICK_INTERVAL_MS = 5_000;

/** ราคาพื้นฐานต่อสินค้า (สอดคล้องกับ TRADE_COMMODITIES.basePrice) */
export const LIVING_BASE_PRICES: Record<LivingCommodityId, number> = {
  'fresh-fish': 45,
  hardwood: 60,
  'iron-ore': 110,
  'sun-silk': 280,
};

export const LIVING_TRADE_CONFIG = {
  minPriceRatio: 0.4,
  maxPriceRatio: 3,
  buySpread: 1.08,
  sellSpread: 0.82,
  marketLiquidity: 40,
  maxMarketImpact: 0.35,
  npcShipCargo: 12,
  pirateLootChance: 0.12,
  shipTravelTicks: 2,
} as const;

function commodity(
  basePrice: number,
  stock: number,
  production: number,
  consumption: number,
  demand: number,
  targetStock: number,
): CommodityState {
  return {
    stock,
    production,
    consumption,
    demand,
    demandMultiplier: 1,
    basePrice,
    currentPrice: basePrice,
    previousPrice: basePrice,
    targetStock,
  };
}

/** เกาะป่า — ผลิตอาหาร/ไม้ ต้องการเหล็ก/ผ้า */
function forestIsland(): TradeIslandState {
  return {
    id: 'starter-island',
    population: 800,
    stability: 0.85,
    portLevel: 1,
    pirateThreat: 0.15,
    marineInfluence: 0.3,
    wealth: 1200,
    routeTargets: ['mist-jungle', 'sunscar-desert'],
    commodities: {
      'fresh-fish': commodity(45, 150, 20, 120, 80, 100),
      hardwood: commodity(60, 200, 25, 15, 60, 100),
      'iron-ore': commodity(110, 30, 0, 8, 50, 60),
      'sun-silk': commodity(280, 20, 0, 5, 35, 40),
    },
  };
}

/** เกาะเหมือง — ผลิตเหล็ก ต้องการอาหาร/ไม้ */
function miningIsland(): TradeIslandState {
  return {
    id: 'mist-jungle',
    population: 500,
    stability: 0.7,
    portLevel: 1,
    pirateThreat: 0.35,
    marineInfluence: 0.2,
    wealth: 900,
    routeTargets: ['starter-island', 'sunscar-desert'],
    commodities: {
      'fresh-fish': commodity(45, 40, 2, 100, 90, 80),
      hardwood: commodity(60, 25, 0, 20, 70, 60),
      'iron-ore': commodity(110, 120, 18, 5, 55, 90),
      'sun-silk': commodity(280, 15, 0, 3, 30, 35),
    },
  };
}

/** เกาะท่าเรือ — ผลิตผ้า ต้องการไม้/เหล็ก/อาหาร */
function harborIsland(): TradeIslandState {
  return {
    id: 'sunscar-desert',
    population: 1200,
    stability: 0.75,
    portLevel: 2,
    pirateThreat: 0.25,
    marineInfluence: 0.45,
    wealth: 1800,
    routeTargets: ['starter-island', 'mist-jungle'],
    commodities: {
      'fresh-fish': commodity(45, 80, 5, 216, 150, 120),
      hardwood: commodity(60, 35, 0, 30, 100, 80),
      'iron-ore': commodity(110, 40, 0, 15, 80, 70),
      'sun-silk': commodity(280, 90, 15, 10, 70, 80),
    },
  };
}

export function createInitialWorld(): {
  islands: TradeIslandState[];
  routes: TradeRouteState[];
} {
  const islands = [forestIsland(), miningIsland(), harborIsland()];
  const routes: TradeRouteState[] = [
    route('starter-island', 'mist-jungle', 0.75, 0.3),
    route('starter-island', 'sunscar-desert', 0.8, 0.2),
    route('mist-jungle', 'sunscar-desert', 0.55, 0.45),
    route('mist-jungle', 'starter-island', 0.7, 0.35),
    route('sunscar-desert', 'starter-island', 0.78, 0.22),
    route('sunscar-desert', 'mist-jungle', 0.5, 0.5),
  ];
  return { islands, routes };
}

function route(
  source: IslandId,
  target: IslandId,
  safety: number,
  pirateActivity: number,
): TradeRouteState {
  return {
    sourceIslandId: source,
    targetIslandId: target,
    safety,
    traffic: 0.3,
    pirateActivity,
    stormRisk: 0.1,
    transportCapacity: 3,
  };
}

export function isLivingCommodity(id: string): id is LivingCommodityId {
  return (LIVING_COMMODITY_IDS as readonly string[]).includes(id);
}
