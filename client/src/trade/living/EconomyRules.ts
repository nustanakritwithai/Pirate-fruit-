import type {
  CommodityState,
  CargoShip,
  EconomyCellState,
  EconomyLogEntry,
  EconomyWorldState,
  FactoryAgentState,
  LivingCommodityId,
  MarketState,
  PriceTrend,
} from './types';
import { ECONOMY_CONFIG } from './LivingTradeConfig';
import { calculatePrice, stockRatio } from './LivingTradeFormulas';
import {
  COMMODITY_RESERVE,
  LIVING_COMMODITY_META,
  type ProductionRecipe,
  recipeForOutput,
  recipesForCell,
} from './ProductionRecipes';

/** ความมั่นคงอาหาร 0–100 */
export function getFoodSecurity(cell: EconomyCellState): number {
  const fish = cell.commodities['fresh-fish'];
  const dried = cell.commodities['dried-fish'];
  if (!fish && !dried) return 50;
  const fishRatio = fish ? stockRatio(fish) : 0;
  const driedRatio = dried ? stockRatio(dried) * 0.95 : 0;
  return Math.min(100, Math.max(fishRatio, driedRatio) * 100);
}

/** ความมั่งคั่ง 0–100 */
export function getWealth(cell: EconomyCellState): number {
  let score = 25 + cell.population / 50;
  const silk = cell.commodities['sun-silk'];
  const luxury = cell.commodities['luxury-cloth'];
  const parts = cell.commodities.sailcloth;
  if (silk) score += stockRatio(silk) * 25;
  if (luxury) score += stockRatio(luxury) * 20;
  if (parts) score += stockRatio(parts) * 15;
  return Math.min(100, score);
}

/** เครื่องมือเพียงพอ → ผลิตเร็วขึ้น / ขาด → ช้าลง */
export function getToolEfficiency(cell: EconomyCellState): number {
  const tools = cell.commodities.tools;
  if (!tools) return 1;
  if (tools.stock >= tools.targetStock) return 1.2;
  if (tools.stock < tools.targetStock * 0.3) return 0.75;
  return 1;
}

export function canProduceRecipe(cell: EconomyCellState, recipe: ProductionRecipe): boolean {
  const output = cell.commodities[recipe.id];
  if (!output) return false;
  if (output.stock >= output.targetStock * 1.4) return false;
  if (recipe.id === 'luxury-cloth' && getFoodSecurity(cell) < 40) return false;

  for (const [inputId, amount] of Object.entries(recipe.inputs) as [LivingCommodityId, number][]) {
    const input = cell.commodities[inputId];
    if (!input || amount <= 0) return false;
    const reserve = COMMODITY_RESERVE[inputId] ?? LIVING_COMMODITY_META[inputId].reserveStock ?? 0;
    if (input.stock - amount < reserve) return false;
  }
  return true;
}

/** ขั้น 1: ผลิตวัตถุดิบ — ปรับกำลังผลิตตามสต็อก แรงงาน และเครื่องมือ */
export function produceGoods(cell: EconomyCellState): void {
  const foodSec = getFoodSecurity(cell);
  if (foodSec < 40) {
    cell.workforce = Math.max(0.4, cell.workforce - 0.05);
  } else {
    cell.workforce = Math.min(1, cell.workforce + 0.02);
  }

  const toolEff = getToolEfficiency(cell);

  for (const item of Object.values(cell.commodities)) {
    if (!item || item.baseProduction <= 0) continue;
    const ratio = stockRatio(item);
    if (ratio > 1.4) {
      item.production = item.baseProduction * 0.85;
    } else if (ratio < 0.6) {
      item.production = item.baseProduction * 1.08;
    } else {
      item.production = item.baseProduction;
    }
    let output = item.production * cell.workforce * toolEff;
    item.stock += output;
  }
}

/** ขั้น 2: บริโภค — ปรับตาม unemployment */
export function consumeGoods(cell: EconomyCellState): void {
  const laborPool = Math.max(1, cell.population * 0.32);
  const unemployedRate = Math.min(1, cell.unemployment / laborPool);
  const demandMult = 1 - unemployedRate * 0.15;

  for (const item of Object.values(cell.commodities)) {
    if (!item) continue;
    const use = item.consumption * (0.8 + cell.population / 2000) * demandMult;
    item.stock = Math.max(0, item.stock - use);
  }
}

/** ขั้น 3: แปรรูปตามสูตร — ควบคุมโดย FactoryAgent */
export function runProduction(
  cell: EconomyCellState,
  log: EconomyLogEntry[],
  factories: FactoryAgentState[] = [],
): void {
  if (!factories.length) {
    runProductionLegacy(cell, log);
    return;
  }

  const cellAgents = factories
    .filter((f) => f.cellId === cell.id && f.status !== 'paused' && f.outputScale > 0 && f.retoolingTicks <= 0)
    .sort((a, b) => {
      const pa = recipeForOutput(a.activeRecipeId)?.priority ?? 99;
      const pb = recipeForOutput(b.activeRecipeId)?.priority ?? 99;
      return pa - pb;
    });

  let craftedThisTick = 0;

  for (const agent of cellAgents) {
    if (craftedThisTick >= ECONOMY_CONFIG.maxCraftPerTick) break;
    const recipe = recipeForOutput(agent.activeRecipeId);
    if (!recipe) continue;
    if (!canProduceRecipeScaled(cell, recipe, agent.outputScale)) continue;

    const scale = agent.outputScale;
    const output = cell.commodities[recipe.id]!;
    for (const [inputId, amount] of Object.entries(recipe.inputs) as [LivingCommodityId, number][]) {
      cell.commodities[inputId]!.stock -= amount * scale;
    }
    const produced = recipe.outputAmount * scale;
    output.stock += produced;
    craftedThisTick += 1;

    if (recipe.id === 'sailcloth') {
      cell.transportCapacity = Math.min(
        ECONOMY_CONFIG.maxTransportCapacity,
        cell.transportCapacity + 0.15 * scale,
      );
    }

    if (produced >= 0.5) {
      log.push({
        tick: 0,
        message: `${cell.nameTh}ผลิต${LIVING_COMMODITY_META[recipe.id].label} ${produced.toFixed(1)} หน่วย`,
        cellId: cell.id,
        commodityId: recipe.id,
      });
    }
  }
}

export function canProduceRecipeScaled(
  cell: EconomyCellState,
  recipe: ProductionRecipe,
  scale: number,
): boolean {
  const output = cell.commodities[recipe.id];
  if (!output) return false;
  if (output.stock >= output.targetStock * 1.4) return false;
  if (recipe.id === 'luxury-cloth' && getFoodSecurity(cell) < 40) return false;

  for (const [inputId, amount] of Object.entries(recipe.inputs) as [LivingCommodityId, number][]) {
    const input = cell.commodities[inputId];
    if (!input || amount <= 0) return false;
    const reserve = COMMODITY_RESERVE[inputId] ?? LIVING_COMMODITY_META[inputId].reserveStock ?? 0;
    if (input.stock - amount * scale < reserve) return false;
  }
  return scale > 0;
}

function runProductionLegacy(cell: EconomyCellState, log: EconomyLogEntry[]): void {
  const recipes = recipesForCell(cell.id);
  let craftedThisTick = 0;

  for (const recipe of recipes) {
    if (craftedThisTick >= ECONOMY_CONFIG.maxCraftPerTick) break;
    if (!canProduceRecipe(cell, recipe)) continue;

    const output = cell.commodities[recipe.id]!;
    for (const [inputId, amount] of Object.entries(recipe.inputs) as [LivingCommodityId, number][]) {
      cell.commodities[inputId]!.stock -= amount;
    }
    output.stock += recipe.outputAmount;
    craftedThisTick += 1;

    if (recipe.id === 'sailcloth') {
      cell.transportCapacity = Math.min(
        ECONOMY_CONFIG.maxTransportCapacity,
        cell.transportCapacity + 0.15,
      );
    }

    log.push({
      tick: 0,
      message: `${cell.nameTh}ผลิต${LIVING_COMMODITY_META[recipe.id].label} ${recipe.outputAmount} หน่วย`,
      cellId: cell.id,
      commodityId: recipe.id,
    });
  }
}

function findMissingInput(cell: EconomyCellState, outputId: LivingCommodityId): string | null {
  const recipe = recipesForCell(cell.id).find((r) => r.id === outputId);
  if (!recipe) return null;
  for (const [inputId, amount] of Object.entries(recipe.inputs) as [LivingCommodityId, number][]) {
    const input = cell.commodities[inputId];
    const reserve = COMMODITY_RESERVE[inputId] ?? 0;
    if (!input || input.stock - amount < reserve) {
      return LIVING_COMMODITY_META[inputId].label;
    }
  }
  return null;
}

/** อัปเดตตัวคูณโลกจากสินค้าแปรรูป */
export function updateWorldModifiers(world: EconomyWorldState): void {
  const yard = world.cells.find((c) => c.id === 'shipyard-island');
  const parts = yard?.commodities.sailcloth;
  world.npcCargoCapacityMultiplier =
    parts && parts.stock > parts.targetStock ? 1.2 : 1;

  let crateReduction = 0;
  for (const cell of world.cells) {
    const crates = cell.commodities['trade-crate'];
    if (crates && crates.stock >= crates.targetStock * 0.5) {
      crateReduction = Math.max(crateReduction, 0.5);
    }
  }
  world.spoilageReduction = crateReduction;
}

/** ขั้น 4: คำนวณความต้องการ */
export function updateDemand(cell: EconomyCellState): void {
  for (const [id, item] of Object.entries(cell.commodities) as [LivingCommodityId, CommodityState][]) {
    if (!item) continue;

    if (id === 'luxury-cloth') {
      const wealth = getWealth(cell);
      const foodSec = getFoodSecurity(cell);
      if (foodSec < 40) item.demand = 10;
      else if (wealth > 70) item.demand = 90;
      else if (wealth > 40) item.demand = 50;
      else item.demand = 20;
      item.importDemand *= 0.9;
      item.exportDemand *= 0.9;
      continue;
    }

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

/** ขั้น 8: เสื่อมสภาพ — หีบสินค้าลดอัตราเน่าเสีย */
export function resolveSpoilage(
  cell: EconomyCellState,
  log: EconomyLogEntry[],
  spoilageReduction = 0,
): void {
  for (const [id, item] of Object.entries(cell.commodities) as [LivingCommodityId, CommodityState][]) {
    if (!item?.perishable) continue;
    const ratio = stockRatio(item);
    if (ratio > 1.5) {
      const rate = ECONOMY_CONFIG.spoilageRate * (1 - spoilageReduction);
      const loss = Math.floor(item.stock * rate);
      if (loss > 0) {
        item.stock -= loss;
        log.push({
          tick: 0,
          message: `${LIVING_COMMODITY_META[id].label}เน่าเสีย ${loss} หน่วย — สต็อกล้นเกินไป`,
          cellId: cell.id,
          commodityId: id,
        });
      }
    }
  }
}

/** สร้างคำสั่งซื้อระหว่างเซลล์ */
export function createTradeRequests(world: EconomyWorldState): CargoShip[] {
  const ships: CargoShip[] = [];
  let shipId = world.ships.length;

  for (const route of world.routes) {
    const origin = world.cells.find((c) => c.id === route.sourceCellId);
    const dest = world.cells.find((c) => c.id === route.targetCellId);
    if (!origin || !dest) continue;
    const capacity = origin.transportCapacity * world.npcCargoCapacityMultiplier;
    if (world.ships.filter((s) => s.originCellId === origin.id).length >= capacity) {
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
        const spoil = Math.floor(amount * ECONOMY_CONFIG.transitSpoilageRate * (1 - world.spoilageReduction));
        delivered -= spoil;
        if (spoil > 0) {
          log.push({
            tick: world.tick,
            message: `${LIVING_COMMODITY_META[id].label}เสีย ${spoil} หน่วยระหว่างขนส่ง`,
            cellId: dest.id,
            commodityId: id,
          });
        }
      }
      item.stock += delivered;
      log.push({
        tick: world.tick,
        message: `เรือสินค้านำ${LIVING_COMMODITY_META[id].label} ${delivered} หน่วยถึง${dest.nameTh}`,
        cellId: dest.id,
        commodityId: id,
      });
    }
  }
}

/** สถานะโรงงานสำหรับ UI */
export function getFactoryStatus(
  cell: EconomyCellState,
  factories: FactoryAgentState[] = [],
): string | null {
  const cellFactories = factories.filter((f) => f.cellId === cell.id);
  const paused = cellFactories.find((f) => f.status === 'paused');
  if (paused) {
    return `หยุดผลิต${LIVING_COMMODITY_META[paused.activeRecipeId].label}`;
  }
  const reducing = cellFactories.find((f) => f.status === 'reducing');
  if (reducing) {
    return `ลดผลิต${Math.round(reducing.outputScale * 100)}%`;
  }
  for (const recipe of recipesForCell(cell.id)) {
    const output = cell.commodities[recipe.id];
    if (!output || output.stock >= output.targetStock * 0.8) continue;
    const missing = findMissingInput(cell, recipe.id);
    if (missing) return `ขาด${missing}`;
  }
  return null;
}

/** @deprecated ใช้ runProduction แทน */
export function transformGoods(
  cell: EconomyCellState,
  log: EconomyLogEntry[],
  factories: FactoryAgentState[] = [],
): void {
  runProduction(cell, log, factories);
}
