import type { IslandId } from '../../island/IslandTypes';
import {
  consumeGoods,
  moveCargo,
  produceGoods,
  resolveSpoilage,
  runProduction,
  scheduleImportConvoys,
  spreadDemand,
  updateDemand,
  updatePrices,
  updateWorldModifiers,
  getFactoryStatus,
} from './EconomyRules';
import {
  CELL_TO_GAME_ISLAND,
  CELL_LABELS,
  ECONOMY_CONFIG,
  LIVING_COMMODITY_IDS,
  essentialReserveStock,
  isLivingCommodity,
  resolveTradeCell,
} from './LivingTradeConfig';
import {
  livingBuyPrice,
  livingSellPrice,
  marketImpact,
  marketSaturation,
} from './LivingTradeFormulas';
import { LIVING_ECONOMY_BOUNDS, mergeNewsBatch, prependBounded, trimEconomyWorldState } from './LivingEconomyBounds';
import { generateNewsFromTick } from './LivingTradeNews';
import { createFreshWorld, loadEconomyState, saveEconomyState } from './LivingTradePersistence';
import { appendFactoryEventsToLog, updateAdaptiveEconomy } from './AdaptiveEconomy';
import {
  forceDriftGenomes,
  forceEvaluateFitness,
  forceResolveIdentities,
  updateEconomyGenome,
} from './EconomyGenomeOrchestrator';
import { ensureGenomeState, createGenomeForCell } from './EconomyGenomeInitializer';
import { addPressure, clearPressures } from './GenomePressureStore';
import { clearEvolutionHistory } from './EvolutionHistory';
import { createFactoryAgentsForCell, initCellWorkforce } from './FactoryAgent';
import {
  updateDynamicTradeEconomy,
  debugForceShortage as dynForceShortage,
  debugForceSurplus,
  debugClearOrders,
  debugAssignBestOrder,
  debugCompleteFirstInTransit,
  debugFailFirstInTransit,
  debugForceRaid,
  debugAddProfitMemory,
  clearTraderMemory,
  resetRouteReputations,
} from './DynamicTradeEconomy';
import { recordPlayerTrade } from './PlayerEconomicProfileManager';
import { updatePlayerEconomy, trackContract, getTrackedContract } from './PlayerEconomyOrchestrator';
import {
  acceptContract,
  abandonContract,
  type ContractWallet,
} from './PlayerContractManager';
import { ensurePlayerEconomy } from './PlayerEconomicProfileManager';
import { getIslandFeeModifier } from './PlayerReputationManager';
import { resolveMarketState } from './EconomyRules';
import { emitPlayerEconomyEvents } from './PlayerEconomyEvents';
import { createDefaultPlayerEconomy } from './PlayerEconomyHistory';
import type {
  CommodityState,
  EconomyCellId,
  EconomyCellState,
  EconomyLogEntry,
  EconomyWorldState,
  LivingCommodityId,
  TradeNewsItem,
} from './types';

export interface LivingTradeSimulatorOptions {
  /** Start from an already validated world (used by the S7 server runtime and snapshot sync). */
  initialWorld?: EconomyWorldState;
  fresh?: boolean;
  /** Server execution supplies a no-op; browser Local mode keeps the legacy serializer. */
  persist?: (world: EconomyWorldState) => void;
}

/** Economic Cellular Automata — หัวใจคือสินค้าและเศรษฐกิจเท่านั้น */
export class LivingTradeSimulator {
  private world: EconomyWorldState;
  private tickLog: EconomyLogEntry[] = [];
  private contractWallet: ContractWallet | null = null;
  private readonly persistWorld: (world: EconomyWorldState) => void;
  private serverReadOnly = false;

  constructor(freshOrOptions: boolean | LivingTradeSimulatorOptions = false) {
    const options = typeof freshOrOptions === 'boolean'
      ? { fresh: freshOrOptions }
      : freshOrOptions;
    this.persistWorld = options.persist ?? saveEconomyState;
    const saved = options.initialWorld ?? (options.fresh ? null : loadEconomyState());
    if (saved) {
      this.world = saved;
    } else {
      this.world = createFreshWorld();
      for (const cell of this.world.cells) updatePrices(cell);
      this.persist();
    }
  }

  /** Replace the read model atomically when a newer server snapshot arrives. */
  replaceState(world: EconomyWorldState): void {
    this.world = world;
    this.tickLog = [];
  }

  setServerReadOnly(readOnly: boolean): void {
    this.serverReadOnly = readOnly;
  }

  private persist(): void {
    this.persistWorld(this.world);
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

  /** สต็อกที่ร้านขายได้จริงหลังหักคลังยังชีพของประชาชน */
  getTradableStock(gameIslandId: IslandId, commodityId: string): number | null {
    if (!isLivingCommodity(commodityId)) return null;
    const cellId = resolveTradeCell(gameIslandId, commodityId);
    const item = this.getCommodity(cellId, commodityId);
    if (!item) return null;
    return Math.max(0, item.stock - essentialReserveStock(commodityId, item.targetStock));
  }

  setContractWallet(wallet: ContractWallet | null): void {
    this.contractWallet = wallet;
  }

  get playerEconomy() {
    return ensurePlayerEconomy(this.world);
  }

  getFeeModifierForIsland(islandId: IslandId): number {
    return getIslandFeeModifier(ensurePlayerEconomy(this.world).profile, islandId);
  }

  acceptPlayerContract(contractId: string) {
    if (this.serverReadOnly) {
      return { ok: false, message: 'สัญญา Remote จะเปิดเมื่อ Server รองรับใน S10', events: [] };
    }
    if (!this.contractWallet) return { ok: false, message: 'ไม่มี wallet', events: [] };
    const result = acceptContract(this.world, contractId, this.contractWallet);
    if (result.ok) this.persist();
    emitPlayerEconomyEvents(result.events);
    return result;
  }

  abandonPlayerContract(contractId: string) {
    if (this.serverReadOnly) {
      return { ok: false, message: 'สัญญา Remote จะเปิดเมื่อ Server รองรับใน S10', events: [] };
    }
    if (!this.contractWallet) return { ok: false, message: 'ไม่มี wallet', events: [] };
    const result = abandonContract(this.world, contractId, this.contractWallet);
    if (result.ok) this.persist();
    emitPlayerEconomyEvents(result.events);
    return result;
  }

  trackPlayerContract(contractId: string | null): void {
    if (this.serverReadOnly) return;
    trackContract(this.world, contractId);
  }

  getTrackedPlayerContract() {
    return getTrackedContract(this.world);
  }

  applyPlayerBuy(
    gameIslandId: IslandId,
    commodityId: LivingCommodityId,
    amount: number,
    unitPrice: number,
  ): void {
    if (this.serverReadOnly) return;
    const cellId = resolveTradeCell(gameIslandId, commodityId);
    const cell = this.getCell(cellId);
    const item = this.getCommodity(cellId, commodityId);
    if (!cell || !item) return;

    const stockBefore = item.stock;
    const marketStateBefore = item.marketState;

    item.stock = Math.max(0, item.stock - amount);
    item.memory.recentBuyVolume += amount;
    item.importDemand += amount * 0.1;
    updatePrices(cell);
    item.marketState = resolveMarketState(item);

    const events = recordPlayerTrade(this.world, {
      islandId: gameIslandId,
      commodityId,
      type: 'buy',
      amount,
      unitPrice,
      stockBefore,
      targetStock: item.targetStock,
      marketStateBefore,
      item,
    });
    emitPlayerEconomyEvents(events);
    this.persist();
  }

  applyPlayerSell(
    gameIslandId: IslandId,
    commodityId: LivingCommodityId,
    amount: number,
    unitPrice: number,
  ): void {
    if (this.serverReadOnly) return;
    const cellId = resolveTradeCell(gameIslandId, commodityId);
    const cell = this.getCell(cellId);
    const item = this.getCommodity(cellId, commodityId);
    if (!cell || !item) return;

    const stockBefore = item.stock;
    const marketStateBefore = item.marketState;

    item.stock += amount;
    item.memory.recentSellVolume += amount;
    updatePrices(cell);
    item.marketState = resolveMarketState(item);

    const events = recordPlayerTrade(this.world, {
      islandId: gameIslandId,
      commodityId,
      type: 'sell',
      amount,
      unitPrice,
      stockBefore,
      targetStock: item.targetStock,
      marketStateBefore,
      item,
    }, this.contractWallet ?? undefined);

    emitPlayerEconomyEvents(events);
    this.persist();
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
    if (this.serverReadOnly) return;
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
    updatePlayerEconomy(this.world, this.tickLog, this.contractWallet ?? undefined);
    this.runDynamicTrade();
    moveCargo(this.world, this.tickLog);
    scheduleImportConvoys(this.world, this.tickLog);
    updateEconomyGenome(this.world);

    for (const entry of this.tickLog) entry.tick = this.world.tick;
    this.world.log = prependBounded(
      this.world.log,
      this.tickLog,
      LIVING_ECONOMY_BOUNDS.maxEconomyLogEntries,
    );

    const newNews = generateNewsFromTick(this.world, this.tickLog);
    this.world.news = mergeNewsBatch(
      this.world.news,
      newNews,
      LIVING_ECONOMY_BOUNDS.maxNewsEntries,
    );
    trimEconomyWorldState(this.world);
    this.persist();
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
    if (this.serverReadOnly) return;
    dynForceShortage(this.world, cellId, commodityId, amount);
    const cell = this.getCell(cellId);
    if (cell) updatePrices(cell);
  }

  injectSurplus(cellId: EconomyCellId, commodityId: LivingCommodityId, amount: number): void {
    if (this.serverReadOnly) return;
    debugForceSurplus(this.world, cellId, commodityId, amount);
    const cell = this.getCell(cellId);
    if (cell) updatePrices(cell);
  }

  generateOrdersDebug(): void {
    if (this.serverReadOnly) return;
    updateDynamicTradeEconomy(this.world, this.tickLog);
  }

  assignBestOrderDebug(): void {
    if (this.serverReadOnly) return;
    debugAssignBestOrder(this.world, this.tickLog);
  }

  failShipmentDebug(): void {
    if (this.serverReadOnly) return;
    debugFailFirstInTransit(this.world, this.tickLog);
    moveCargo(this.world, this.tickLog);
  }

  completeShipmentDebug(): void {
    if (this.serverReadOnly) return;
    debugCompleteFirstInTransit(this.world, this.tickLog);
    moveCargo(this.world, this.tickLog);
  }

  clearOrdersDebug(): void {
    if (this.serverReadOnly) return;
    debugClearOrders(this.world);
  }

  forceRouteSuccessDebug(): void {
    if (this.serverReadOnly) return;
    debugCompleteFirstInTransit(this.world, this.tickLog);
    moveCargo(this.world, this.tickLog);
  }

  forceRaidDebug(): void {
    if (this.serverReadOnly) return;
    debugForceRaid(this.world, this.tickLog);
  }

  addProfitMemoryDebug(
    traderId: string,
    source: EconomyCellId,
    dest: EconomyCellId,
    commodity: LivingCommodityId,
    profit: number,
  ): void {
    if (this.serverReadOnly) return;
    debugAddProfitMemory(this.world, traderId, source, dest, commodity, profit);
  }

  clearTraderMemoryDebug(traderId: string): void {
    if (this.serverReadOnly) return;
    clearTraderMemory(this.world, traderId);
  }

  resetRouteReputationDebug(): void {
    if (this.serverReadOnly) return;
    resetRouteReputations(this.world);
  }

  tickMany50(): void {
    this.tickMany(50);
  }

  get traderProfiles(): readonly import('./types').TraderProfile[] {
    return this.world.traderProfiles ?? [];
  }

  get traderMemories(): readonly import('./types').TraderRouteMemory[] {
    return this.world.traderRouteMemories ?? [];
  }

  get routeReputations(): readonly import('./types').RouteReputation[] {
    return this.world.routeReputations ?? [];
  }

  get avoidedRoutes(): readonly import('./types').AvoidedRouteState[] {
    return this.world.avoidedRoutes ?? [];
  }

  get lastTradeTickResult(): import('./DynamicTradeEconomy').DynamicTradeTickResult | null {
    return this._lastTradeResult;
  }

  private _lastTradeResult: import('./DynamicTradeEconomy').DynamicTradeTickResult | null = null;

  resetFactoryAgents(): void {
    if (this.serverReadOnly) return;
    this.world.factories = [];
    for (const cell of this.world.cells) {
      this.world.factories.push(...createFactoryAgentsForCell(cell));
      initCellWorkforce(cell, this.world.factories);
    }
  }

  resetPlayerEconomyDebug(): void {
    if (this.serverReadOnly) return;
    this.world.playerEconomy = createDefaultPlayerEconomy();
    this.persist();
  }

  freezeGenomeDebug(pressureToo = false): void {
    if (this.serverReadOnly) return;
    ensureGenomeState(this.world);
    this.world.genomeState!.genomeDebug.freezeDrift = true;
    if (pressureToo) this.world.genomeState!.genomeDebug.freezePressureCollection = true;
  }

  resumeGenomeDebug(): void {
    if (this.serverReadOnly) return;
    ensureGenomeState(this.world);
    this.world.genomeState!.genomeDebug.freezeDrift = false;
    this.world.genomeState!.genomeDebug.freezePressureCollection = false;
    this.world.genomeState!.genomeDebug.accelMultiplier = 1;
  }

  accelGenomeDebug(multiplier: number): void {
    if (this.serverReadOnly) return;
    ensureGenomeState(this.world);
    this.world.genomeState!.genomeDebug.accelMultiplier = multiplier;
  }

  addGenomePressureDebug(
    cellId: EconomyCellId,
    source: 'factory' | 'trader' | 'player' | 'market',
    strength: number,
    commodityId?: LivingCommodityId,
  ): void {
    if (this.serverReadOnly) return;
    addPressure(this.world, {
      cellId,
      source,
      target: 'production-bias',
      commodityId,
      strength,
    });
  }

  forceWoodPressureDebug(cellId: EconomyCellId, positive: boolean): void {
    if (this.serverReadOnly) return;
    addPressure(this.world, {
      cellId,
      source: 'factory',
      target: 'production-bias',
      commodityId: 'hardwood',
      strength: positive ? 0.5 : -0.5,
    });
  }

  evaluateFitnessDebug(): void {
    if (this.serverReadOnly) return;
    forceEvaluateFitness(this.world);
  }

  driftGenomeDebug(): void {
    if (this.serverReadOnly) return;
    forceDriftGenomes(this.world);
  }

  resolveIdentityDebug(): void {
    if (this.serverReadOnly) return;
    forceResolveIdentities(this.world);
  }

  resetGenomeDebug(cellId?: EconomyCellId): void {
    if (this.serverReadOnly) return;
    ensureGenomeState(this.world);
    if (cellId) {
      const idx = this.world.genomeState!.genomes.findIndex((g) => g.cellId === cellId);
      if (idx >= 0) this.world.genomeState!.genomes[idx] = createGenomeForCell(cellId);
    } else {
      this.world.genomeState!.genomes = this.world.cells.map((c) => createGenomeForCell(c.id));
    }
  }

  clearPressuresDebug(cellId?: EconomyCellId): void {
    if (this.serverReadOnly) return;
    clearPressures(this.world, cellId);
  }

  clearEvolutionHistoryDebug(): void {
    if (this.serverReadOnly) return;
    clearEvolutionHistory(this.world);
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
