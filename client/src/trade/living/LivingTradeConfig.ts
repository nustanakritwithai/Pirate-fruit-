import type { IslandId } from '../../island/IslandTypes';
import type {
  CommodityState,
  EconomyCellId,
  EconomyCellState,
  EconomyRole,
  LivingCommodityId,
  TradeRouteState,
} from './types';

export const LIVING_COMMODITY_IDS: readonly LivingCommodityId[] = [
  'fresh-fish',
  'hardwood',
  'iron-ore',
  'sun-silk',
  'sailcloth',
] as const;

export const LIVING_TICK_INTERVAL_MS = 5_000;

export const ECONOMY_CONFIG = {
  minPriceRatio: 0.4,
  maxPriceRatio: 3,
  buySpread: 1.08,
  sellSpread: 0.82,
  marketLiquidity: 40,
  maxMarketImpact: 0.35,
  npcCargoMax: 8,
  npcDepartEveryTicks: 4,
  shipPartsRecipe: { wood: 10, iron: 6, cloth: 3 },
  maxCraftPerTick: 2,
  maxTransportCapacity: 4,
  spoilageRate: 0.05,
  transitSpoilageRate: 0.03,
  baseTransportTicks: 2,
} as const;

export const CELL_TO_GAME_ISLAND: Record<EconomyCellId, IslandId> = {
  'leaf-island': 'starter-island',
  'mine-island': 'mist-jungle',
  'cloth-island': 'sunscar-desert',
  'shipyard-island': 'starter-island',
};

export const CELL_LABELS: Record<EconomyCellId, string> = {
  'leaf-island': 'เกาะใบไม้',
  'mine-island': 'เกาะเหมือง',
  'cloth-island': 'เกาะทอผ้า',
  'shipyard-island': 'เกาะอู่เรือ',
};

export const LIVING_BASE_PRICES: Record<LivingCommodityId, number> = {
  'fresh-fish': 45,
  hardwood: 60,
  'iron-ore': 110,
  'sun-silk': 280,
  sailcloth: 90,
};

function goods(
  basePrice: number,
  stock: number,
  production: number,
  consumption: number,
  baseDemand: number,
  targetStock: number,
  perishable = false,
): CommodityState {
  return {
    stock,
    production,
    baseProduction: production,
    consumption,
    demand: baseDemand,
    baseDemand,
    importDemand: 0,
    exportDemand: 0,
    targetStock,
    basePrice,
    currentPrice: basePrice,
    previousPrice: basePrice,
    trend: 'stable',
    marketState: 'balanced',
    perishable,
    memory: {
      recentBuyVolume: 0,
      recentSellVolume: 0,
      shortageTicks: 0,
      surplusTicks: 0,
      averagePrice: basePrice,
    },
  };
}

function cell(
  id: EconomyCellId,
  role: EconomyRole,
  gameIslandId: IslandId,
  nameTh: string,
  population: number,
  commodities: Partial<Record<LivingCommodityId, CommodityState>>,
  neighbors: EconomyCellId[],
  transportCapacity = 1,
): EconomyCellState {
  return {
    id,
    role,
    gameIslandId,
    nameTh,
    population,
    workforce: 1,
    transportCapacity,
    commodities,
    neighbors,
  };
}

/** เกาะใบไม้ — ผลิตอาหาร+ไม้ */
function leafCell(): EconomyCellState {
  return cell(
    'leaf-island',
    'forest',
    'starter-island',
    'เกาะใบไม้',
    700,
    {
      'fresh-fish': goods(45, 160, 20, 8, 30, 100, true),
      hardwood: goods(60, 180, 15, 5, 25, 100),
      'iron-ore': goods(110, 25, 0, 4, 35, 50),
      'sun-silk': goods(280, 15, 0, 3, 30, 40),
    },
    ['mine-island', 'cloth-island', 'shipyard-island'],
  );
}

/** เกาะเหมือง — ผลิตเหล็ก */
function mineCell(): EconomyCellState {
  return cell(
    'mine-island',
    'mine',
    'mist-jungle',
    'เกาะเหมือง',
    500,
    {
      'fresh-fish': goods(45, 35, 0, 12, 50, 80, true),
      hardwood: goods(60, 20, 0, 8, 45, 60),
      'iron-ore': goods(110, 110, 14, 3, 40, 90),
    },
    ['leaf-island', 'cloth-island', 'shipyard-island'],
  );
}

/** เกาะทอผ้า */
function clothCell(): EconomyCellState {
  return cell(
    'cloth-island',
    'cloth',
    'sunscar-desert',
    'เกาะทอผ้า',
    600,
    {
      'fresh-fish': goods(45, 50, 2, 8, 40, 80, true),
      hardwood: goods(60, 20, 0, 5, 35, 60),
      'sun-silk': goods(280, 85, 12, 4, 35, 80),
    },
    ['leaf-island', 'mine-island', 'shipyard-island'],
  );
}

/** เกาะอู่เรือ — แปรรูปชิ้นส่วนเรือ */
function shipyardCell(): EconomyCellState {
  return cell(
    'shipyard-island',
    'shipyard',
    'starter-island',
    'เกาะอู่เรือ',
    400,
    {
      'fresh-fish': goods(45, 40, 0, 10, 45, 70, true),
      hardwood: goods(60, 30, 0, 10, 60, 80),
      'iron-ore': goods(110, 35, 0, 6, 55, 70),
      'sun-silk': goods(280, 20, 0, 3, 40, 50),
      sailcloth: goods(90, 15, 0, 2, 30, 40),
    },
    ['leaf-island', 'mine-island', 'cloth-island'],
    2,
  );
}

export function createInitialWorld(): {
  cells: EconomyCellState[];
  routes: TradeRouteState[];
} {
  const cells = [leafCell(), mineCell(), clothCell(), shipyardCell()];
  const routes = buildRoutes(cells);
  return { cells, routes };
}

function buildRoutes(cells: EconomyCellState[]): TradeRouteState[] {
  const routes: TradeRouteState[] = [];
  const ticks = ECONOMY_CONFIG.baseTransportTicks;
  for (const cell of cells) {
    for (const neighborId of cell.neighbors) {
      if (cell.id < neighborId) {
        routes.push({
          sourceCellId: cell.id,
          targetCellId: neighborId,
          travelTicks: ticks,
          transportCost: 5,
        });
        routes.push({
          sourceCellId: neighborId,
          targetCellId: cell.id,
          travelTicks: ticks,
          transportCost: 5,
        });
      }
    }
  }
  return routes;
}

export function isLivingCommodity(id: string): id is LivingCommodityId {
  return (LIVING_COMMODITY_IDS as readonly string[]).includes(id);
}

/** หาเซลล์เศรษฐกิจสำหรับสินค้า */
export function cellForCommodity(commodityId: LivingCommodityId): EconomyCellId {
  switch (commodityId) {
    case 'fresh-fish':
    case 'hardwood':
      return 'leaf-island';
    case 'iron-ore':
      return 'mine-island';
    case 'sun-silk':
      return 'cloth-island';
    case 'sailcloth':
      return 'shipyard-island';
  }
}

/** หาเซลล์เศรษฐกิจที่ตลาดท้องถิ่นของเกาะนี้ติดตามสินค้านั้น */
export function resolveTradeCell(
  gameIslandId: IslandId,
  commodityId: LivingCommodityId,
): EconomyCellId {
  if (commodityId === 'sailcloth') return 'shipyard-island';
  if (gameIslandId === 'starter-island') return 'leaf-island';
  if (gameIslandId === 'mist-jungle') return 'mine-island';
  if (gameIslandId === 'sunscar-desert') return 'cloth-island';
  return cellForCommodity(commodityId);
}
