import type { IslandId } from '../../island/IslandTypes';
import {
  consumeGoods,
  moveCargo,
  produceGoods,
  resolveSpoilage,
  runProduction,
  spreadDemand,
  updateDemand,
  updatePrices,
  updateWorldModifiers,
  getFactoryStatus,
} from './EconomyRules';
import {
  CELL_TO_GAME_ISLAND,
  ECONOMY_CONFIG,
  LIVING_COMMODITY_IDS,
  isLivingCommodity,
  resolveTradeCell,
} from './LivingTradeConfig';
import {
  livingBuyPrice,
  livingSellPrice,
  marketImpact,
  marketSaturation,
} from './LivingTradeFormulas';
import { generateNewsFromTick } from './LivingTradeNews';
import { createFreshWorld, loadEconomyState, saveEconomyState } from './LivingTradePersistence';
import { appendFactoryEventsToLog, updateAdaptiveEconomy } from './AdaptiveEconomy';
import { createFactoryAgentsForCell, initCellWorkforce } from './FactoryAgent';
import {
  updateDynamicTradeEconomy,
  debugForceShortage as dynForceShortage,
  debugForceSurplus,
  debugClearOrders,
  debugAssignBestOrder,
  debugCompleteFirstInTransit,
  debugFailFirstInTransit,
} from './DynamicTradeEconomy';
import type {
  CommodityState,
  EconomyCellId,
  EconomyCellState,
  EconomyLogEntry,
  EconomyWorldState,
  LivingCommodityId,
  TradeNewsItem,
} from './types';

const CELL_LABELS: Record<EconomyCellId, string> = {
  'leaf-island': 'เกาะใบไม้',
  'mine-island': 'เกาะเหมือง',
  'cloth-island': 'เกาะทอผ้า',
  'shipyard-island': 'เกาะอู่เรือ',
};

/** Economic Cellular Automata — หัวใจคือสินค้าและเศรษฐกิจเท่านั้น */
export class LivingTradeSimulator {
  private world: EconomyWorldState;
  private tickLog: EconomyLogEntry[] = [];

  constructor(fresh = false) {
    const saved = fresh ? null : loadEconomyState();
    if (saved) {
      this.world = saved;
    } else {
      this.world = createFreshWorld();
      for (const cell of this.world.cells) updatePrices(cell);
      saveEconomyState(this.world);
    }
  }

  get state(): Readonly<EconomyWorldState> {
    return this.world;
  }

  get news(): readonly TradeNewsItem[] {
    return this.world.news;
  }

  get log(): readonly EconomyLogEntry[] {
    return this.world.log;
  }

  getCell(cellId: EconomyCellId): EconomyCellState | undefined {
    return this.world.cells.find((c) => c.id === cellId);
  }

  getIsland(islandId: IslandId): EconomyCellState | undefined {
    return this.world.cells.find((c) => c.gameIslandId === islandId);
  }

  getCommodity(cellId: EconomyCellId, commodityId: LivingCommodityId): CommodityState | undefined {
    return this.getCell(cellId)?.commodities[commodityId];
  }

  getCommodityAtGameIsland(
    gameIslandId: IslandId,
    commodityId: LivingCommodityId,
  ): CommodityState | undefined {
    const cellId = resolveTradeCell(gameIslandId, commodityId);
    return this.getCommodity(cellId, commodityId);
  }

  isLivingCommodity(id: string): id is LivingCommodityId {
    return isLivingCommodity(id);
  }

  getBuyPrice(gameIslandId: IslandId, commodityId: string, amount = 1): number | null {
    if (!isLivingCommodity(commodityId)) return null;
    const cellId = resolveTradeCell(gameIslandId, commodityId);
    const item = this.getCommodity(cellId, commodityId);
    if (!item) return null;
    return livingBuyPrice(item, marketImpact(amount));
  }

  getSellPrice(gameIslandId: IslandId, commodityId: string, amount = 1): number | null {
    if (!isLivingCommodity(commodityId)) return null;
    const cellId = resolveTradeCell(gameIslandId, commodityId);
    const item = this.getCommodity(cellId, commodityId);
    if (!item) return null;
    return livingSellPrice(item, marketSaturation(amount, item.stock));
  }

  getStock(gameIslandId: IslandId, commodityId: string): number | null {
    if (!isLivingCommodity(commodityId)) return null;
    const cellId = resolveTradeCell(gameIslandId, commodityId);
    return this.getCommodity(cellId, commodityId)?.stock ?? null;
  }

  applyPlayerBuy(gameIslandId: IslandId, commodityId: LivingCommodityId, amount: number): void {
    const cellId = resolveTradeCell(gameIslandId, commodityId);
    const cell = this.getCell(cellId);
    const item = this.getCommodity(cellId, commodityId);
    if (!cell || !item) return;
    item.stock = Math.max(0, item.stock - amount);
    item.memory.recentBuyVolume += amount;
    item.importDemand += amount * 0.1;
    updatePrices(cell);
    saveEconomyState(this.world);
  }

  applyPlayerSell(gameIslandId: IslandId, commodityId: LivingCommodityId, amount: number): void {
    const cellId = resolveTradeCell(gameIslandId, commodityId);
    const cell = this.getCell(cellId);
    const item = this.getCommodity(cellId, commodityId);
    if (!cell || !item) return;
    item.stock += amount;
    item.memory.recentSellVolume += amount;
    updatePrices(cell);
    saveEconomyState(this.world);
  }

  get factories(): readonly import('./types').FactoryAgentState[] {
    return this.world.factories;
  }

  getFactoryStatus(cellId: import('./types').EconomyCellId): string | null {
    const cell = this.getCell(cellId);
    if (!cell) return null;
    return getFactoryStatus(cell, this.world.factories);
  }

  tick(): void {
    this.world.tick += 1;
    this.tickLog = [];

    for (const cell of this.world.cells) {
      produceGoods(cell);
      consumeGoods(cell);
    }

    const factoryEvents = updateAdaptiveEconomy(this.world);
    appendFactoryEventsToLog(factoryEvents, this.tickLog, this.world.tick);

    for (const cell of this.world.cells) {
      runProduction(cell, this.tickLog, this.world.factories);
      updateDemand(cell);
      updatePrices(cell);
      resolveSpoilage(cell, this.tickLog, this.world.spoilageReduction);
    }

    spreadDemand(this.world);
    updateWorldModifiers(this.world);
    this.runDynamicTrade();
    moveCargo(this.world, this.tickLog);

    for (const entry of this.tickLog) entry.tick = this.world.tick;
    this.world.log = [...this.tickLog, ...this.world.log].slice(0, 40);

    const newNews = generateNewsFromTick(this.world, this.tickLog);
    this.world.news = [...newNews, ...this.world.news].slice(0, 15);
    saveEconomyState(this.world);
  }

  tickMany(count: number): void {
    for (let i = 0; i < count; i++) this.tick();
  }

  bestArbitrageFrom(gameIslandId: IslandId): {
    commodityId: LivingCommodityId;
    profit: number;
    toIslandId: IslandId;
  } | null {
    let best: { commodityId: LivingCommodityId; profit: number; toIslandId: IslandId } | null = null;
    for (const commodityId of LIVING_COMMODITY_IDS) {
      const buyCellId = resolveTradeCell(gameIslandId, commodityId);
      if (CELL_TO_GAME_ISLAND[buyCellId] !== gameIslandId) continue;
      const buy = this.getBuyPrice(gameIslandId, commodityId, 1);
      if (buy == null) continue;
      for (const targetCell of this.world.cells) {
        if (targetCell.id === buyCellId) continue;
        const sell = this.getSellPrice(targetCell.gameIslandId, commodityId, 1);
        if (sell == null) continue;
        const profit = sell - buy - ECONOMY_CONFIG.baseTransportTicks;
        if (profit > 0 && (!best || profit > best.profit)) {
          best = { commodityId, profit, toIslandId: targetCell.gameIslandId };
        }
      }
    }
    return best;
  }

  injectShortage(cellId: EconomyCellId, commodityId: LivingCommodityId, amount: number): void {
    dynForceShortage(this.world, cellId, commodityId, amount);
    const cell = this.getCell(cellId);
    if (cell) updatePrices(cell);
  }

  injectSurplus(cellId: EconomyCellId, commodityId: LivingCommodityId, amount: number): void {
    debugForceSurplus(this.world, cellId, commodityId, amount);
    const cell = this.getCell(cellId);
    if (cell) updatePrices(cell);
  }

  generateOrdersDebug(): void {
    updateDynamicTradeEconomy(this.world, this.tickLog);
  }

  assignBestOrderDebug(): void {
    debugAssignBestOrder(this.world, this.tickLog);
  }

  failShipmentDebug(): void {
    debugFailFirstInTransit(this.world, this.tickLog);
    moveCargo(this.world, this.tickLog);
  }

  completeShipmentDebug(): void {
    debugCompleteFirstInTransit(this.world, this.tickLog);
    moveCargo(this.world, this.tickLog);
  }

  clearOrdersDebug(): void {
    debugClearOrders(this.world);
  }

  get lastTradeTickResult(): import('./DynamicTradeEconomy').DynamicTradeTickResult | null {
    return this._lastTradeResult;
  }

  private _lastTradeResult: import('./DynamicTradeEconomy').DynamicTradeTickResult | null = null;

  resetFactoryAgents(): void {
    this.world.factories = [];
    for (const cell of this.world.cells) {
      this.world.factories.push(...createFactoryAgentsForCell(cell));
      initCellWorkforce(cell, this.world.factories);
    }
  }

  private runDynamicTrade(): void {
    this.world.npcCooldown -= 1;
    const onDepartWave = this.world.npcCooldown <= 0;
    if (onDepartWave) {
      this.world.npcCooldown = ECONOMY_CONFIG.npcDepartEveryTicks;
    }

    const result = updateDynamicTradeEconomy(this.world, this.tickLog, { allowDepart: onDepartWave });
    this._lastTradeResult = result;

    for (const order of result.highProfitRoutes) {
      this.tickLog.push({
        tick: this.world.tick,
        message: `เส้นทางกำไรสูง: ${order.commodityId} ~${Math.round(order.expectedProfit)} Beli`,
        cellId: order.destinationIslandId,
        commodityId: order.commodityId,
      });
    }
    for (const warn of result.criticalShortages) {
      this.tickLog.push({
        tick: this.world.tick,
        message: `🚨 ${warn}`,
        cellId: undefined,
      });
    }
    for (const ship of result.departed) {
      this.tickLog.push({
        tick: this.world.tick,
        message: `เรือสินค้าออกจาก${CELL_LABELS[ship.originCellId]} → ${CELL_LABELS[ship.destinationCellId]}`,
        cellId: ship.originCellId,
      });
    }
  }
}
