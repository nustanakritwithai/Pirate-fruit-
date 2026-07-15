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
  'frost-crystal',
  'storm-core',
  'volcanic-ore',
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
  npcDepartEveryTicks: 3,
  maxCraftPerTick: 2,
  maxTransportCapacity: 4,
  maxSupplyConvoysPerTick: 8,
  spoilageRate: 0.05,
  transitSpoilageRate: 0.03,
  baseTransportTicks: 2,
} as const;

export const CELL_TO_GAME_ISLAND: Record<EconomyCellId, IslandId> = {
  'leaf-island': 'starter-island',
  'mine-island': 'mist-jungle',
  'cloth-island': 'sunscar-desert',
  'shipyard-island': 'starter-island',
  'frost-island': 'azure-frost',
  'sky-island': 'tempest-sky',
  'volcano-island': 'ember-volcano',
};

export const CELL_LABELS: Record<EconomyCellId, string> = {
  'leaf-island': 'เกาะใบไม้',
  'mine-island': 'เกาะเหมือง',
  'cloth-island': 'เกาะทอผ้า',
  'shipyard-island': 'เกาะอู่เรือ',
  'frost-island': 'เกาะเหมันต์คราม',
  'sky-island': 'เกาะนภาวายุ',
  'volcano-island': 'เกาะภูผาอัคคี',
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
  'frost-crystal': 360,
  'storm-core': 480,
  'volcanic-ore': 300,
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
  productionUnits = 1,
): EconomyCellState {
  return {
    id,
    role,
    gameIslandId,
    nameTh,
    population,
    workforce: 1,
    availableWorkforce: 0,
    unemployment: Math.floor(population * 0.1),
    wageLevel: 10,
    productionUnits,
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
      'frost-crystal': goods(360, 4, 0, 1, 20, 24),
      'storm-core': goods(480, 3, 0, 1, 18, 18),
      'volcanic-ore': goods(300, 3, 0, 1, 20, 20),
    },
    ['mine-island', 'cloth-island', 'shipyard-island'],
    2,
    6,
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
      'frost-crystal': goods(360, 5, 0, 1, 22, 28),
      'storm-core': goods(480, 4, 0, 1, 18, 18),
      'volcanic-ore': goods(300, 5, 0, 1, 22, 24),
    },
    ['leaf-island', 'cloth-island', 'shipyard-island'],
    2,
    6,
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
      'frost-crystal': goods(360, 4, 0, 1, 18, 22),
      'storm-core': goods(480, 3, 0, 1, 18, 18),
      'volcanic-ore': goods(300, 4, 0, 1, 18, 20),
    },
    ['leaf-island', 'mine-island', 'shipyard-island'],
    2,
    6,
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
      'frost-crystal': goods(360, 3, 0, 1, 22, 26),
      'storm-core': goods(480, 4, 0, 1, 22, 22),
      'volcanic-ore': goods(300, 5, 0, 1, 24, 26),
    },
    ['leaf-island', 'mine-island', 'cloth-island'],
    3,
    8,
  );
}

/** เกาะเหมันต์คราม — ผลิตผลึกน้ำแข็งและนำเข้าสินค้าจำเป็นจากทะเลอื่น */
function frostCell(): EconomyCellState {
  return cell(
    'frost-island',
    'frost',
    'azure-frost',
    'เกาะเหมันต์คราม',
    450,
    {
      'frost-crystal': goods(360, 65, 14, 2, 34, 55),
      'fresh-fish': goods(45, 45, 0, 10, 52, 70, true),
      'dried-fish': goods(68, 68, 0, 5, 44, 60),
      hardwood: goods(60, 60, 0, 6, 42, 55),
      'iron-ingot': goods(165, 35, 0, 2, 38, 42),
      tools: goods(320, 30, 0, 1, 34, 36),
      'herbal-medicine': goods(180, 35, 0, 2, 36, 38),
      'sun-silk': goods(280, 25, 0, 1, 25, 30),
      'storm-core': goods(480, 6, 0, 1, 28, 22),
      'volcanic-ore': goods(300, 6, 0, 1, 28, 24),
    },
    [],
    2,
    6,
  );
}

/** เกาะนภาวายุ — เก็บเกี่ยวแกนพายุและนำเข้าเสบียงจากเกาะล่าง */
function skyCell(): EconomyCellState {
  return cell(
    'sky-island',
    'sky',
    'tempest-sky',
    'เกาะนภาวายุ',
    520,
    {
      'storm-core': goods(480, 58, 12, 2, 36, 50),
      'fresh-fish': goods(45, 25, 0, 10, 55, 70, true),
      'dried-fish': goods(68, 42, 0, 6, 46, 64),
      hardwood: goods(60, 22, 0, 7, 48, 60),
      'iron-ingot': goods(165, 24, 0, 3, 42, 48),
      tools: goods(320, 18, 0, 1, 34, 38),
      rope: goods(140, 22, 0, 2, 32, 38),
      'frost-crystal': goods(360, 7, 0, 1, 30, 24),
      'volcanic-ore': goods(300, 5, 0, 1, 30, 22),
      sailcloth: goods(240, 12, 0, 1, 25, 28),
    },
    [],
    2,
    7,
  );
}

/** เกาะภูผาอัคคี — ผลิตแร่อัคคีและนำเข้าผลึก/อาหารที่ภูเขาไฟผลิตไม่ได้ */
function volcanoCell(): EconomyCellState {
  return cell(
    'volcano-island',
    'volcano',
    'ember-volcano',
    'เกาะภูผาอัคคี',
    580,
    {
      'volcanic-ore': goods(300, 72, 16, 2, 38, 60),
      'fresh-fish': goods(45, 24, 0, 11, 58, 75, true),
      'dried-fish': goods(68, 40, 0, 6, 48, 68),
      hardwood: goods(60, 20, 0, 7, 45, 58),
      'iron-ingot': goods(165, 26, 0, 3, 42, 48),
      tools: goods(320, 20, 0, 1, 36, 40),
      rope: goods(140, 18, 0, 2, 34, 40),
      'frost-crystal': goods(360, 6, 0, 1, 32, 24),
      'storm-core': goods(480, 6, 0, 1, 30, 22),
      'repair-kit': goods(195, 10, 0, 1, 28, 30),
    },
    [],
    2,
    7,
  );
}

/** ทุกตลาดมีของนำเข้าอย่างน้อยเล็กน้อย — ไม่ปล่อยให้ UI หรือระบบซื้อขายเจอ undefined/0 */
export function ensureCommodityCoverage(cells: EconomyCellState[]): void {
  for (const current of cells) {
    for (const commodityId of LIVING_COMMODITY_IDS) {
      if (current.commodities[commodityId]) continue;
      const targetStock = commodityId === 'fresh-fish'
        ? 70
        : commodityId === 'dried-fish'
          ? 60
          : commodityId === 'hardwood'
            ? 55
            : commodityId === 'luxury-cloth' || commodityId === 'storm-core'
              || commodityId === 'frost-crystal' || commodityId === 'volcanic-ore'
              ? 24
              : 38;
      current.commodities[commodityId] = goods(
        LIVING_BASE_PRICES[commodityId],
        Math.max(2, Math.floor(targetStock * 0.18)),
        0,
        commodityId === 'fresh-fish' ? 10 : 1,
        Math.max(16, targetStock * 0.5),
        targetStock,
        commodityId === 'fresh-fish',
      );
    }
  }
}

export function createInitialWorld(): {
  cells: EconomyCellState[];
  routes: TradeRouteState[];
} {
  const cells = [
    leafCell(),
    mineCell(),
    clothCell(),
    shipyardCell(),
    frostCell(),
    skyCell(),
    volcanoCell(),
  ];
  ensureCommodityCoverage(cells);
  // เรือพาณิชย์ต้องมีเส้นทางไปถึงทุกเกาะ ไม่ผูกไว้แค่เพื่อนบ้านชุดเก่า
  // เพื่อให้สินค้านำเข้าไม่ค้างที่ 0 เมื่อเพิ่มเกาะใหม่หรือโหลดเซฟเดิม
  const allCellIds = cells.map((current) => current.id);
  for (const current of cells) {
    current.neighbors = allCellIds.filter((id) => id !== current.id);
  }
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
          distance: ticks * 10,
          danger: 0.15,
          traffic: 0,
          capacity: 4,
          successfulTrips: 0,
          failedTrips: 0,
        });
        routes.push({
          sourceCellId: neighborId,
          targetCellId: cell.id,
          travelTicks: ticks,
          transportCost: 5,
          distance: ticks * 10,
          danger: 0.15,
          traffic: 0,
          capacity: 4,
          successfulTrips: 0,
          failedTrips: 0,
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
    case 'frost-crystal':
      return 'frost-island';
    case 'storm-core':
      return 'sky-island';
    case 'volcanic-ore':
      return 'volcano-island';
  }
}

/** หาเซลล์เศรษฐกิจที่ตลาดท้องถิ่นของเกาะนี้ติดตามสินค้านั้น */
export function resolveTradeCell(
  gameIslandId: IslandId,
  commodityId: LivingCommodityId,
): EconomyCellId {
  if (
    gameIslandId === 'starter-island'
    && (commodityId === 'sailcloth' || commodityId === 'repair-kit')
  ) {
    return 'shipyard-island';
  }
  if (gameIslandId === 'starter-island') return 'leaf-island';
  if (gameIslandId === 'mist-jungle') return 'mine-island';
  if (gameIslandId === 'sunscar-desert') return 'cloth-island';
  if (gameIslandId === 'azure-frost') return 'frost-island';
  if (gameIslandId === 'tempest-sky') return 'sky-island';
  if (gameIslandId === 'ember-volcano') return 'volcano-island';
  return cellForCommodity(commodityId);
}
