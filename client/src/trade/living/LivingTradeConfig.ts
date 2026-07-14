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
  'dried-fish',
  'hardwood',
  'iron-ore',
  'iron-ingot',
  'tools',
  'sun-silk',
  'rope',
  'luxury-cloth',
  'healing-herb',
  'herbal-medicine',
  'sailcloth',
  'repair-kit',
  'trade-crate',
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
  'dried-fish': 68,
  hardwood: 60,
  'iron-ore': 110,
  'iron-ingot': 165,
  tools: 320,
  'sun-silk': 280,
  rope: 140,
  'luxury-cloth': 520,
  'healing-herb': 95,
  'herbal-medicine': 180,
  sailcloth: 240,
  'repair-kit': 195,
  'trade-crate': 125,
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

/** เกาะใบไม้ — ผลิตอาหาร+ไม้ แปรรูปปลาแห้ง+หีบ */
function leafCell(): EconomyCellState {
  return cell(
    'leaf-island',
    'forest',
    'starter-island',
    'เกาะใบไม้',
    700,
    {
      'fresh-fish': goods(45, 160, 20, 8, 30, 100, true),
      'dried-fish': goods(68, 40, 0, 4, 35, 60),
      hardwood: goods(60, 180, 15, 5, 25, 100),
      'iron-ingot': goods(165, 20, 0, 3, 30, 40),
      tools: goods(320, 12, 0, 1, 25, 30),
      'trade-crate': goods(125, 25, 0, 1, 20, 35),
    },
    ['mine-island', 'cloth-island', 'shipyard-island'],
  );
}

/** เกาะเหมือง — แร่ สมุนไพร แปรรูปเหล็ก+เครื่องมือ+ยา */
function mineCell(): EconomyCellState {
  return cell(
    'mine-island',
    'mine',
    'mist-jungle',
    'เกาะเหมือง',
    500,
    {
      'fresh-fish': goods(45, 35, 0, 10, 50, 80, true),
      'dried-fish': goods(68, 20, 0, 8, 45, 70),
      hardwood: goods(60, 20, 0, 8, 45, 60),
      'iron-ore': goods(110, 110, 14, 3, 40, 90),
      'iron-ingot': goods(165, 35, 0, 2, 35, 55),
      'healing-herb': goods(95, 70, 10, 2, 30, 60),
      'herbal-medicine': goods(180, 18, 0, 3, 40, 45),
      tools: goods(320, 15, 0, 1, 30, 35),
    },
    ['leaf-island', 'cloth-island', 'shipyard-island'],
  );
}

/** เกาะทอผ้า — ผ้าไหม เชือก ผ้าหรู */
function clothCell(): EconomyCellState {
  return cell(
    'cloth-island',
    'cloth',
    'sunscar-desert',
    'เกาะทอผ้า',
    600,
    {
      'fresh-fish': goods(45, 50, 2, 8, 40, 80, true),
      'dried-fish': goods(68, 30, 0, 6, 35, 65),
      hardwood: goods(60, 20, 0, 5, 35, 60),
      'sun-silk': goods(280, 85, 12, 4, 35, 80),
      rope: goods(140, 30, 0, 2, 30, 50),
      'luxury-cloth': goods(520, 12, 0, 1, 25, 30),
      tools: goods(320, 8, 0, 1, 25, 25),
    },
    ['leaf-island', 'mine-island', 'shipyard-island'],
  );
}

/** เกาะอู่เรือ — ชิ้นส่วนเรือ ชุดซ่อม หีบ */
function shipyardCell(): EconomyCellState {
  return cell(
    'shipyard-island',
    'shipyard',
    'starter-island',
    'เกาะอู่เรือ',
    400,
    {
      'fresh-fish': goods(45, 40, 0, 10, 45, 70, true),
      'dried-fish': goods(68, 25, 0, 8, 40, 60),
      hardwood: goods(60, 30, 0, 10, 60, 80),
      'iron-ingot': goods(165, 25, 0, 4, 50, 60),
      rope: goods(140, 15, 0, 2, 40, 45),
      tools: goods(320, 10, 0, 1, 35, 30),
      sailcloth: goods(240, 15, 0, 2, 30, 40),
      'repair-kit': goods(195, 12, 0, 2, 35, 40),
      'trade-crate': goods(125, 18, 0, 1, 25, 35),
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

/** หาเซลล์เศรษฐกิจหลักที่ผลิตสินค้า */
export function cellForCommodity(commodityId: LivingCommodityId): EconomyCellId {
  switch (commodityId) {
    case 'fresh-fish':
    case 'dried-fish':
    case 'trade-crate':
      return 'leaf-island';
    case 'iron-ore':
    case 'iron-ingot':
    case 'healing-herb':
    case 'herbal-medicine':
    case 'tools':
      return 'mine-island';
    case 'sun-silk':
    case 'rope':
    case 'luxury-cloth':
      return 'cloth-island';
    case 'hardwood':
      return 'leaf-island';
    case 'sailcloth':
    case 'repair-kit':
      return 'shipyard-island';
  }
}

/** หาเซลล์เศรษฐกิจที่ตลาดท้องถิ่นของเกาะนี้ติดตามสินค้านั้น */
export function resolveTradeCell(
  gameIslandId: IslandId,
  commodityId: LivingCommodityId,
): EconomyCellId {
  if (
    commodityId === 'sailcloth'
    || commodityId === 'repair-kit'
    || (commodityId === 'trade-crate' && gameIslandId === 'starter-island')
  ) {
    return 'shipyard-island';
  }
  if (commodityId === 'dried-fish' || commodityId === 'trade-crate') {
    return 'leaf-island';
  }
  if (gameIslandId === 'starter-island') return 'leaf-island';
  if (gameIslandId === 'mist-jungle') return 'mine-island';
  if (gameIslandId === 'sunscar-desert') return 'cloth-island';
  return cellForCommodity(commodityId);
}
