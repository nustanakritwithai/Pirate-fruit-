import type {
  CommodityState,
  CargoShip,
  EconomyCellState,
  EconomyLogEntry,
  EconomyWorldState,
  LivingCommodityId,
  MarketState,
  PriceTrend,
} from './types';
import { ECONOMY_CONFIG } from './LivingTradeConfig';
import { calculatePrice, stockRatio } from './LivingTradeFormulas';

/** ขั้น 1: ผลิต — ปรับกำลังผลิตตามสต็อกและแรงงาน */
export function produceGoods(cell: EconomyCellState): void {
  const food = cell.commodities['fresh-fish'];
  const foodRatio = food ? stockRatio(food) : 1;
  if (food && foodRatio < 0.4) {
    cell.workforce = Math.max(0.4, cell.workforce - 0.05);
  } else {
    cell.workforce = Math.min(1, cell.workforce + 0.02);
  }

  for (const item of Object.values(cell.commodities)) {
    if (!item) continue;
    const ratio = stockRatio(item);
    if (ratio > 1.4) {
      item.production = item.baseProduction * 0.85;
    } else if (ratio < 0.6) {
      item.production = item.baseProduction * 1.08;
    } else {
      item.production = item.baseProduction;
    }
    const output = item.production * cell.workforce;
    item.stock += output;
  }
}

/** ขั้น 2: บริโภค */
export function consumeGoods(cell: EconomyCellState): void {
  for (const item of Object.values(cell.commodities)) {
    if (!item) continue;
    const use = item.consumption * (0.8 + cell.population / 2000);
    item.stock = Math.max(0, item.stock - use);
  }
}

/** ขั้น 3: แปรรูป — อู่เรือผลิตชิ้นส่วนเรือ */
export function transformGoods(cell: EconomyCellState, log: EconomyLogEntry[]): void {
  if (cell.role !== 'shipyard') return;
  const wood = cell.commodities.hardwood;
  const iron = cell.commodities['iron-ore'];
  const cloth = cell.commodities['sun-silk'];
  const parts = cell.commodities.sailcloth;
  if (!wood || !iron || !cloth || !parts) return;

  const recipe = ECONOMY_CONFIG.shipPartsRecipe;
  let crafted = 0;
  while (
    wood.stock >= recipe.wood
    && iron.stock >= recipe.iron
    && cloth.stock >= recipe.cloth
    && crafted < ECONOMY_CONFIG.maxCraftPerTick
  ) {
    wood.stock -= recipe.wood;
    iron.stock -= recipe.iron;
    cloth.stock -= recipe.cloth;
    parts.stock += 1;
    crafted += 1;
  }
  if (crafted > 0) {
    cell.transportCapacity = Math.min(
      ECONOMY_CONFIG.maxTransportCapacity,
      cell.transportCapacity + crafted * 0.15,
    );
    log.push({
      tick: 0,
      message: `อู่เรือผลิตชิ้นส่วนเรือ ${crafted} ชิ้น — กำลังขนส่งเพิ่ม`,
      cellId: cell.id,
      commodityId: 'sailcloth',
    });
  } else if (parts.stock < parts.targetStock * 0.5) {
    const missing =
      wood.stock < recipe.wood ? 'ไม้'
      : iron.stock < recipe.iron ? 'เหล็ก'
      : 'ผ้า';
    log.push({
      tick: 0,
      message: `การผลิตชิ้นส่วนเรือหยุดชั่วคราว — ขาด${missing}`,
      cellId: cell.id,
      commodityId: 'sailcloth',
    });
  }
}

/** ขั้น 4: คำนวณความต้องการ */
export function updateDemand(cell: EconomyCellState): void {
  for (const item of Object.values(cell.commodities)) {
    if (!item) continue;
    const ratio = stockRatio(item);
    const shortageDemand = ratio < 0.8 ? (1 - ratio) * 40 : 0;
    const surplusDemand = ratio > 1.3 ? -10 : 0;
    item.demand =
      item.baseDemand
      + shortageDemand
      + item.importDemand
      - item.exportDemand * 0.5
      + surplusDemand;
    item.demand = Math.max(5, item.demand);
    item.importDemand *= 0.9;
    item.exportDemand *= 0.9;
  }
}

/** ขั้น 5–6: สถานะตลาด + ราคา */
export function updatePrices(cell: EconomyCellState): void {
  for (const item of Object.values(cell.commodities)) {
    if (!item) continue;
    item.previousPrice = item.currentPrice;
    item.marketState = resolveMarketState(item);
    item.currentPrice = calculatePrice(item);
    item.trend = resolveTrend(item);
    const mem = item.memory;
    mem.averagePrice = mem.averagePrice * 0.9 + item.currentPrice * 0.1;
    if (item.marketState === 'shortage' || item.marketState === 'crisis') {
      mem.shortageTicks += 1;
      mem.surplusTicks = 0;
    } else if (item.marketState === 'surplus') {
      mem.surplusTicks += 1;
      mem.shortageTicks = 0;
    } else {
      mem.shortageTicks = Math.max(0, mem.shortageTicks - 1);
      mem.surplusTicks = Math.max(0, mem.surplusTicks - 1);
    }
    mem.recentBuyVolume *= 0.85;
    mem.recentSellVolume *= 0.85;
  }
}

export function resolveMarketState(item: CommodityState): MarketState {
  const ratio = stockRatio(item);
  if (item.stock <= 0 && item.memory.shortageTicks >= 2) return 'collapsed';
  if (ratio < 0.4) return 'crisis';
  if (ratio < 0.8) return 'shortage';
  if (ratio > 1.4) return 'surplus';
  return 'balanced';
}

function resolveTrend(item: CommodityState): PriceTrend {
  const diff = item.currentPrice - item.previousPrice;
  if (diff > 1) return 'rising';
  if (diff < -1) return 'falling';
  return 'stable';
}

/** ขั้น 7: แพร่ความต้องการระหว่างเซลล์ข้างเคียง */
export function spreadDemand(world: EconomyWorldState): void {
  for (const cell of world.cells) {
    for (const neighborId of cell.neighbors) {
      const neighbor = world.cells.find((c) => c.id === neighborId);
      if (!neighbor) continue;
      for (const id of Object.keys(cell.commodities) as LivingCommodityId[]) {
        const sourceItem = cell.commodities[id];
        const neighborItem = neighbor.commodities[id];
        if (!sourceItem || !neighborItem) continue;
        if (
          sourceItem.stock < sourceItem.targetStock * 0.4
          && neighborItem.stock > neighborItem.targetStock * 1.3
        ) {
          sourceItem.importDemand += 5;
          neighborItem.exportDemand += 3;
        }
      }
    }
  }
}

/** ขั้น 8: เสื่อมสภาพ */
export function resolveSpoilage(cell: EconomyCellState, log: EconomyLogEntry[]): void {
  for (const item of Object.values(cell.commodities)) {
    if (!item?.perishable) continue;
    const ratio = stockRatio(item);
    if (ratio > 1.5) {
      const loss = Math.floor(item.stock * ECONOMY_CONFIG.spoilageRate);
      if (loss > 0) {
        item.stock -= loss;
        log.push({
          tick: 0,
          message: `อาหารเน่าเสีย ${loss} หน่วย — สต็อกล้นเกินไป`,
          cellId: cell.id,
          commodityId: 'fresh-fish',
        });
      }
    }
  }
}

/** สร้างคำสั่งซื้อระหว่างเซลล์ (เรียกเมื่อ cooldown หมด) */
export function createTradeRequests(world: EconomyWorldState): CargoShip[] {
  const ships: CargoShip[] = [];
  let shipId = world.ships.length;

  for (const route of world.routes) {
    const origin = world.cells.find((c) => c.id === route.sourceCellId);
    const dest = world.cells.find((c) => c.id === route.targetCellId);
    if (!origin || !dest) continue;
    if (world.ships.filter((s) => s.originCellId === origin.id).length >= origin.transportCapacity) {
      continue;
    }

    let best: { id: LivingCommodityId; score: number; amount: number } | null = null;
    for (const [id, oItem] of Object.entries(origin.commodities) as [LivingCommodityId, CommodityState][]) {
      const dItem = dest.commodities[id];
      if (!dItem) continue;
      const surplus = oItem.stock - oItem.targetStock;
      const need = dItem.targetStock - dItem.stock;
      if (surplus > 12 && need > 8 && oItem.marketState === 'surplus') {
        const score = surplus + need + (dItem.currentPrice - oItem.currentPrice) * 0.1;
        if (!best || score > best.score) {
          best = {
            id,
            score,
            amount: Math.min(
              ECONOMY_CONFIG.npcCargoMax,
              Math.floor(surplus * 0.2),
            ),
          };
        }
      }
    }
    if (!best || best.amount < 3) continue;

    const oItem = origin.commodities[best.id]!;
    oItem.stock -= best.amount;
    ships.push({
      id: `cargo-${++shipId}`,
      originCellId: origin.id,
      destinationCellId: dest.id,
      cargo: { [best.id]: best.amount },
      travelTimeRemaining: route.travelTicks,
    });
  }
  return ships;
}

/** เคลื่อนสินค้าบนเรือ */
export function moveCargo(world: EconomyWorldState, log: EconomyLogEntry[]): void {
  const arrived: CargoShip[] = [];
  const remaining: CargoShip[] = [];

  for (const ship of world.ships) {
    ship.travelTimeRemaining -= 1;
    if (ship.travelTimeRemaining <= 0) arrived.push(ship);
    else remaining.push(ship);
  }
  world.ships = remaining;

  for (const ship of arrived) {
    const dest = world.cells.find((c) => c.id === ship.destinationCellId);
    if (!dest) continue;
    for (const [id, amount] of Object.entries(ship.cargo) as [LivingCommodityId, number][]) {
      if (!amount) continue;
      const item = dest.commodities[id];
      if (!item) continue;
      let delivered = amount;
      if (item.perishable) {
        const spoil = Math.floor(amount * ECONOMY_CONFIG.transitSpoilageRate);
        delivered -= spoil;
        if (spoil > 0) {
          log.push({
            tick: world.tick,
            message: `อาหารเสีย ${spoil} หน่วยระหว่างขนส่ง`,
            cellId: dest.id,
            commodityId: id,
          });
        }
      }
      item.stock += delivered;
      log.push({
        tick: world.tick,
        message: `เรือสินค้านำ${label(id)} ${delivered} หน่วยถึง${dest.nameTh}`,
        cellId: dest.id,
        commodityId: id,
      });
    }
  }
}

function label(id: LivingCommodityId): string {
  const map: Record<LivingCommodityId, string> = {
    'fresh-fish': 'อาหาร',
    hardwood: 'ไม้',
    'iron-ore': 'เหล็ก',
    'sun-silk': 'ผ้า',
    sailcloth: 'ชิ้นส่วนเรือ',
  };
  return map[id];
}
