import { ADAPTIVE_ECONOMY } from './AdaptiveEconomyConfig';
import { alternativeRecipeIds, recipeMeta } from './FactoryRecipeMeta';
import { stockRatio } from './LivingTradeFormulas';
import {
  COMMODITY_RESERVE,
  LIVING_COMMODITY_META,
  type ProductionRecipe,
  recipeForOutput,
  recipesForCell,
} from './ProductionRecipes';
import { genomeProductionBonus } from './GenomeGameplayBias';
import { essentialReserveStock } from './LivingTradeConfig';
import type {
  CommodityState,
  EconomyCellId,
  EconomyCellState,
  EconomyLogEntry,
  EconomyWorldState,
  FactoryAgentState,
  FactoryEvent,
  FactoryEventType,
  FactoryStatus,
  LivingCommodityId,
} from './types';

export interface FactoryScore {
  expectedRevenue: number;
  inputCost: number;
  laborCost: number;
  maintenanceCost: number;
  shortagePenalty: number;
  oversupplyPenalty: number;
  unitProfit: number;
  finalScore: number;
  reasons: string[];
}

/** จำนวนหน่วยโรงงาน/เวิร์กช็อปเริ่มต้นต่อเกาะ — แต่ละหน่วยมี memory และปรับกำลังผลิตเอง */
export const FACTORY_UNITS_PER_CELL: Record<EconomyCellId, number> = {
  'leaf-island': 2,
  'mine-island': 2,
  'cloth-island': 2,
  'shipyard-island': 3,
  'frost-island': 1,
  'sky-island': 1,
  'volcano-island': 1,
};

export function factoryUnitsForCell(cellId: EconomyCellId): number {
  return FACTORY_UNITS_PER_CELL[cellId] ?? 1;
}

export function factoryAgentId(
  cellId: string,
  recipeId: LivingCommodityId,
  unitIndex = 1,
): string {
  return unitIndex <= 1
    ? `${cellId}:${recipeId}`
    : `${cellId}:${recipeId}:unit-${unitIndex}`;
}

export function createFactoryAgentsForCell(cell: EconomyCellState): FactoryAgentState[] {
  const units = factoryUnitsForCell(cell.id);
  return recipesForCell(cell.id)
    .filter((r) => recipeMeta(r.id).requiredWorkers > 0)
    .flatMap((recipe) => Array.from({ length: units }, (_, index) =>
      createDefaultAgent(cell, recipe.id, index + 1)));
}

export function createDefaultAgent(
  cell: EconomyCellState,
  recipeId: LivingCommodityId,
  unitIndex = 1,
): FactoryAgentState {
  const meta = recipeMeta(recipeId);
  const alts = alternativeRecipeIds(cell.id, recipeId);
  return {
    id: factoryAgentId(cell.id, recipeId, unitIndex),
    cellId: cell.id,
    recipeId,
    status: 'operating',
    outputScale: ADAPTIVE_ECONOMY.scaleNormal,
    workforceAssigned: meta.requiredWorkers,
    expectedUnitProfit: 0,
    profitEma: 0,
    profitableTicks: 0,
    unprofitableTicks: 0,
    shortageTicks: 0,
    adaptationCooldown: 0,
    pausedTicks: 0,
    activeRecipeId: recipeId,
    alternativeRecipeIds: alts,
    lastDecision: 'hold',
    retoolingTicks: 0,
    recipeSwitchCooldown: 0,
    lastReasons: [],
  };
}

export function initCellWorkforce(cell: EconomyCellState, factories: FactoryAgentState[]): void {
  const pool = Math.floor(cell.population * ADAPTIVE_ECONOMY.laborPoolRatio);
  const employed = factories
    .filter((f) => f.cellId === cell.id)
    .reduce((s, f) => s + f.workforceAssigned, 0);
  cell.wageLevel = ADAPTIVE_ECONOMY.baseWage;
  cell.unemployment = Math.max(0, pool - employed);
  cell.availableWorkforce = 0;
}

/** ราคาคาดการณ์ — ไม่ใช้ currentPrice อย่างเดียว */
export function getExpectedPrice(item: CommodityState): number {
  const demandAdj = item.basePrice * (1 + (1 - stockRatio(item)) * 0.35);
  return (
    item.currentPrice * ADAPTIVE_ECONOMY.priceWeightCurrent
    + item.memory.averagePrice * ADAPTIVE_ECONOMY.priceWeightAverage
    + demandAdj * ADAPTIVE_ECONOMY.priceWeightDemand
  );
}

function getInputShortagePenalty(
  cell: EconomyCellState,
  recipe: ProductionRecipe,
  scale: number,
  reasons: string[],
): number {
  let penalty = 0;
  for (const [inputId, amount] of Object.entries(recipe.inputs) as [LivingCommodityId, number][]) {
    const input = cell.commodities[inputId];
    if (!input || amount <= 0) continue;
    const reserve = Math.max(
      COMMODITY_RESERVE[inputId] ?? LIVING_COMMODITY_META[inputId].reserveStock ?? 0,
      essentialReserveStock(inputId, input.targetStock),
    );
    const need = amount * scale;
    if (input.stock - need < reserve) {
      penalty += ADAPTIVE_ECONOMY.shortagePenaltyPerInput;
      reasons.push(`${LIVING_COMMODITY_META[inputId].label}ขาด`);
    }
  }
  return penalty;
}

function getOutputOversupplyPenalty(
  cell: EconomyCellState,
  outputId: LivingCommodityId,
  reasons: string[],
): number {
  const output = cell.commodities[outputId];
  if (!output) return 0;
  if (stockRatio(output) > 1.35) {
    reasons.push(`${LIVING_COMMODITY_META[outputId].label}ล้นตลาด`);
    return ADAPTIVE_ECONOMY.oversupplyPenalty;
  }
  return 0;
}

export function scoreFactory(
  factory: FactoryAgentState,
  cell: EconomyCellState,
  recipe: ProductionRecipe,
  forecast = false,
  world?: EconomyWorldState,
): FactoryScore {
  const reasons: string[] = [];
  let effectiveScale: number;
  if (factory.status === 'paused') {
    effectiveScale = forecast ? ADAPTIVE_ECONOMY.scaleMin : 0;
  } else {
    effectiveScale = Math.max(factory.outputScale, ADAPTIVE_ECONOMY.scaleMin);
  }

  if (effectiveScale <= 0) {
    return {
      expectedRevenue: 0,
      inputCost: 0,
      laborCost: 0,
      maintenanceCost: 0,
      shortagePenalty: 0,
      oversupplyPenalty: 0,
      unitProfit: 0,
      finalScore: 0,
      reasons: ['หยุดชั่วคราว'],
    };
  }
  const meta = recipeMeta(recipe.id);
  const output = cell.commodities[recipe.id];

  const sellPrice = output ? getExpectedPrice(output) : recipe.id ? 0 : 0;
  const marketRevenue = sellPrice * recipe.outputAmount * effectiveScale;

  const inputCost = Object.entries(recipe.inputs).reduce((total, [commodityId, amount]) => {
    const item = cell.commodities[commodityId as LivingCommodityId];
    const price = item ? getExpectedPrice(item) : 0;
    return total + price * (amount as number) * effectiveScale;
  }, 0);

  const laborCost =
    meta.requiredWorkers * cell.wageLevel * effectiveScale;
  const maintenanceCost = meta.baseMaintenanceCost * effectiveScale;

  // สินค้าขั้นกลางหลายชนิดมีราคาขายปลีกต่ำกว่าต้นทุนสูตรดั้งเดิม ทำให้
  // adaptive factory ปิดทุกแห่งพร้อมกันและ supply chain เริ่มใหม่ไม่ได้
  // เมืองจึงรับซื้อชั่วคราวเฉพาะตอนสต็อกต่ำกว่า 85% ของเป้าหมาย
  // เมื่อคลังฟื้น โรงงานกลับไปตัดสินใจจากราคาตลาดตามเดิม
  const operatingCost = inputCost + laborCost + maintenanceCost;
  const outputRatio = output ? stockRatio(output) : 1;
  // เงินฟื้นฟูใช้กับสายการผลิตหลักของโรงงานเท่านั้น ไม่ใช้เป็นช่องโหว่ให้
  // โรงงานสลับสูตรไปไล่เงินอุดหนุนของสินค้าทุกชนิด
  const recoveryProcurementRevenue = recipe.id === factory.recipeId && outputRatio < 0.85
    ? operatingCost * 1.08
    : 0;
  const expectedRevenue = Math.max(marketRevenue, recoveryProcurementRevenue);
  if (expectedRevenue > marketRevenue) reasons.push('คำสั่งซื้อฟื้นฟูการผลิต');

  const shortagePenalty = getInputShortagePenalty(cell, recipe, effectiveScale, reasons);
  const oversupplyPenalty = getOutputOversupplyPenalty(cell, recipe.id, reasons);

  const unitProfit = expectedRevenue - inputCost - laborCost - maintenanceCost;
  const genomeBonus = world ? genomeProductionBonus(world, cell.id, recipe.id) : 0;
  const finalScore = unitProfit - shortagePenalty - oversupplyPenalty + genomeBonus;

  if (inputCost > expectedRevenue * 0.6) {
    const expensive = Object.keys(recipe.inputs)[0] as LivingCommodityId | undefined;
    if (expensive && !reasons.some((r) => r.includes('แพง'))) {
      reasons.push(`${LIVING_COMMODITY_META[expensive]?.label ?? 'วัตถุดิบ'}แพง`);
    }
  }

  return {
    expectedRevenue,
    inputCost,
    laborCost,
    maintenanceCost,
    shortagePenalty,
    oversupplyPenalty,
    unitProfit,
    finalScore,
    reasons,
  };
}

function clampScale(scale: number): number {
  return Math.min(ADAPTIVE_ECONOMY.scaleMax, Math.max(ADAPTIVE_ECONOMY.scaleMin, scale));
}

function nudgeScale(current: number, target: number): number {
  const delta = Math.max(
    -ADAPTIVE_ECONOMY.scaleStep,
    Math.min(ADAPTIVE_ECONOMY.scaleStep, target - current),
  );
  return clampScale(current + delta);
}

function layOffWorkers(cell: EconomyCellState, factory: FactoryAgentState, count: number): void {
  const n = Math.min(count, factory.workforceAssigned);
  factory.workforceAssigned -= n;
  cell.unemployment += n;
}

function tryHireWorkers(
  cell: EconomyCellState,
  factory: FactoryAgentState,
  requested: number,
): number {
  const meta = recipeMeta(factory.activeRecipeId);
  const cap = meta.requiredWorkers;
  const need = Math.min(requested, cap - factory.workforceAssigned);
  if (need <= 0) return 0;

  let hired = 0;
  const fromUnemployment = Math.min(need, cell.unemployment);
  cell.unemployment -= fromUnemployment;
  hired += fromUnemployment;
  const remaining = need - fromUnemployment;
  const fromAvailable = Math.min(remaining, cell.availableWorkforce);
  cell.availableWorkforce -= fromAvailable;
  hired += fromAvailable;

  factory.workforceAssigned += hired;
  return hired;
}

function tickCooldown(factory: FactoryAgentState): void {
  if (factory.adaptationCooldown > 0) factory.adaptationCooldown -= 1;
  if (factory.recipeSwitchCooldown > 0) factory.recipeSwitchCooldown -= 1;
  if (factory.retoolingTicks > 0) factory.retoolingTicks -= 1;
}

function updateProfitMemory(factory: FactoryAgentState, score: number): void {
  factory.expectedUnitProfit = score;
  factory.profitEma =
    factory.profitEma * (1 - ADAPTIVE_ECONOMY.profitEmaAlpha)
    + score * ADAPTIVE_ECONOMY.profitEmaAlpha;
}

function updateConsecutiveTicks(factory: FactoryAgentState, score: number): void {
  if (score >= 0) {
    factory.profitableTicks += 1;
    factory.unprofitableTicks = 0;
  } else {
    factory.unprofitableTicks += 1;
    factory.profitableTicks = 0;
  }
  if (factory.shortageTicks > 0 && score < ADAPTIVE_ECONOMY.closeThreshold) {
    factory.shortageTicks += 1;
  } else if (score < 0) {
    factory.shortageTicks += 1;
  } else {
    factory.shortageTicks = Math.max(0, factory.shortageTicks - 1);
  }
}

function setStatus(factory: FactoryAgentState, status: FactoryStatus): void {
  factory.status = status;
}

function emitFactoryEvent(
  type: FactoryEventType,
  factory: FactoryAgentState,
  cell: EconomyCellState,
  message: string,
  toastEligible: boolean,
): FactoryEvent {
  return { type, agent: factory, cellName: cell.nameTh, message, toastEligible };
}

export function evaluateBestRecipe(
  factory: FactoryAgentState,
  cell: EconomyCellState,
  world?: EconomyWorldState,
): { recipeId: LivingCommodityId; score: FactoryScore } {
  const forecast = factory.status === 'paused';
  const candidates = [factory.activeRecipeId, ...factory.alternativeRecipeIds];
  let best = {
    recipeId: factory.activeRecipeId,
    score: scoreFactory(factory, cell, recipeForOutput(factory.activeRecipeId)!, forecast, world),
  };

  for (const id of candidates) {
    const recipe = recipeForOutput(id);
    if (!recipe) continue;
    const s = scoreFactory(factory, cell, recipe, forecast, world);
    if (s.finalScore > best.score.finalScore) {
      best = { recipeId: id, score: s };
    }
  }
  return best;
}

export function updateFactoryAgent(
  factory: FactoryAgentState,
  cell: EconomyCellState,
  world?: EconomyWorldState,
): FactoryEvent | null {
  tickCooldown(factory);

  const best = evaluateBestRecipe(factory, cell, world);
  const currentRecipe = recipeForOutput(factory.activeRecipeId);
  const forecast = factory.status === 'paused';
  const currentScore = currentRecipe
    ? scoreFactory(factory, cell, currentRecipe, forecast, world)
    : best.score;

  const activeScore = factory.activeRecipeId === best.recipeId
    ? (forecast ? scoreFactory(factory, cell, recipeForOutput(best.recipeId)!, true, world) : best.score)
    : currentScore;

  updateProfitMemory(factory, activeScore.finalScore);
  updateConsecutiveTicks(factory, activeScore.finalScore);
  factory.lastReasons = activeScore.reasons;

  if (factory.adaptationCooldown > 0) {
    factory.lastDecision = 'hold';
    return null;
  }

  if (factory.status === 'paused') {
    factory.pausedTicks += 1;
    if (
      factory.profitableTicks >= ADAPTIVE_ECONOMY.profitableTicksToReopen
      && activeScore.finalScore >= ADAPTIVE_ECONOMY.reopenThreshold
    ) {
      factory.outputScale = ADAPTIVE_ECONOMY.scaleMin;
      setStatus(factory, 'recovering');
      factory.lastDecision = 'reopen';
      factory.adaptationCooldown = ADAPTIVE_ECONOMY.adaptationCooldownTicks;
      factory.profitableTicks = 0;
      factory.unprofitableTicks = 0;
      tryHireWorkers(cell, factory, recipeMeta(factory.activeRecipeId).requiredWorkers);
      const label = LIVING_COMMODITY_META[factory.activeRecipeId].label;
      return emitFactoryEvent(
        'FACTORY_REOPENED',
        factory,
        cell,
        `${cell.nameTh}เปิดผลิต${label}อีกครั้ง`,
        true,
      );
    }
    factory.lastDecision = 'hold';
    return null;
  }

  if (factory.recipeSwitchCooldown <= 0 && factory.retoolingTicks <= 0) {
    const margin = ADAPTIVE_ECONOMY.recipeSwitchMargin;
    if (
      best.recipeId !== factory.activeRecipeId
      && best.score.finalScore > currentScore.finalScore * margin
      && best.score.finalScore > ADAPTIVE_ECONOMY.closeThreshold
    ) {
      const oldLabel = LIVING_COMMODITY_META[factory.activeRecipeId].label;
      const newLabel = LIVING_COMMODITY_META[best.recipeId].label;
      factory.activeRecipeId = best.recipeId;
      factory.retoolingTicks = ADAPTIVE_ECONOMY.retoolingTicks;
      factory.recipeSwitchCooldown = ADAPTIVE_ECONOMY.recipeSwitchCooldownTicks;
      factory.adaptationCooldown = ADAPTIVE_ECONOMY.adaptationCooldownTicks;
      factory.lastDecision = 'switch-recipe';
      setStatus(factory, 'recovering');
      factory.outputScale = nudgeScale(factory.outputScale, ADAPTIVE_ECONOMY.scaleMin);
      return emitFactoryEvent(
        'FACTORY_RECIPE_SWITCHED',
        factory,
        cell,
        `${cell.nameTh}เปลี่ยนผลิต${oldLabel}→${newLabel}`,
        true,
      );
    }
  }

  if (
    factory.unprofitableTicks >= ADAPTIVE_ECONOMY.unprofitableTicksToPause
    && activeScore.finalScore < ADAPTIVE_ECONOMY.closeThreshold
    && factory.outputScale <= ADAPTIVE_ECONOMY.scaleMin + 0.05
  ) {
    layOffWorkers(cell, factory, factory.workforceAssigned);
    factory.outputScale = 0;
    setStatus(factory, 'paused');
    factory.lastDecision = 'pause';
    factory.adaptationCooldown = ADAPTIVE_ECONOMY.adaptationCooldownTicks;
    factory.pausedTicks = 0;
    const label = LIVING_COMMODITY_META[factory.activeRecipeId].label;
    return emitFactoryEvent(
      'FACTORY_PAUSED',
      factory,
      cell,
      `${cell.nameTh}หยุดผลิต${label}`,
      true,
    );
  }

  if (
    factory.unprofitableTicks >= ADAPTIVE_ECONOMY.unprofitableTicksToReduce
    && activeScore.finalScore < ADAPTIVE_ECONOMY.closeThreshold
  ) {
    const prev = factory.outputScale;
    factory.outputScale = nudgeScale(factory.outputScale, factory.outputScale - ADAPTIVE_ECONOMY.scaleStep);
    if (factory.outputScale < prev) {
      layOffWorkers(cell, factory, 1);
      setStatus(factory, 'reducing');
      factory.lastDecision = 'reduce';
      factory.adaptationCooldown = ADAPTIVE_ECONOMY.adaptationCooldownTicks;
      const label = LIVING_COMMODITY_META[factory.activeRecipeId].label;
      return emitFactoryEvent(
        'FACTORY_REDUCED',
        factory,
        cell,
        `${cell.nameTh}ลดผลิต${label}`,
        false,
      );
    }
  }

  if (
    factory.profitableTicks >= ADAPTIVE_ECONOMY.profitableTicksToExpand
    && activeScore.finalScore > ADAPTIVE_ECONOMY.reopenThreshold
  ) {
    const hired = tryHireWorkers(cell, factory, 1);
    const prev = factory.outputScale;
    factory.outputScale = nudgeScale(factory.outputScale, factory.outputScale + ADAPTIVE_ECONOMY.scaleStep);
    if (factory.outputScale > prev || hired > 0) {
      setStatus(factory, 'expanding');
      factory.lastDecision = 'expand';
      factory.adaptationCooldown = ADAPTIVE_ECONOMY.adaptationCooldownTicks;
      if (factory.outputScale >= ADAPTIVE_ECONOMY.scaleNormal * 0.95) {
        setStatus(factory, 'operating');
      }
      const label = LIVING_COMMODITY_META[factory.activeRecipeId].label;
      return emitFactoryEvent(
        'FACTORY_EXPANDED',
        factory,
        cell,
        `${cell.nameTh}ขยายผลิต${label}`,
        factory.outputScale - prev >= ADAPTIVE_ECONOMY.scaleStep,
      );
    }
  }

  if (factory.status === 'recovering' && factory.outputScale >= ADAPTIVE_ECONOMY.scaleNormal * 0.9) {
    setStatus(factory, 'operating');
  } else if (
    factory.status === 'reducing'
    && activeScore.finalScore > 0
    && factory.unprofitableTicks === 0
  ) {
    setStatus(factory, 'operating');
  }

  factory.lastDecision = 'hold';
  return null;
}

export function applyUnemploymentToDemand(cell: EconomyCellState): void {
  /* integrated into consumeGoods */
  void cell;
}

/** Debug helpers */
export function debugForcePause(factory: FactoryAgentState, cell: EconomyCellState): void {
  layOffWorkers(cell, factory, factory.workforceAssigned);
  factory.outputScale = 0;
  factory.status = 'paused';
  factory.adaptationCooldown = ADAPTIVE_ECONOMY.adaptationCooldownTicks;
}

export function debugForceReopen(factory: FactoryAgentState, cell: EconomyCellState): void {
  factory.outputScale = ADAPTIVE_ECONOMY.scaleMin;
  factory.status = 'recovering';
  factory.profitableTicks = ADAPTIVE_ECONOMY.profitableTicksToReopen;
  factory.unprofitableTicks = 0;
  tryHireWorkers(cell, factory, recipeMeta(factory.activeRecipeId).requiredWorkers);
}

export function factoryEventsToLog(
  events: FactoryEvent[],
  tick: number,
): EconomyLogEntry[] {
  return events.map((e) => ({
    tick,
    message: e.message,
    cellId: e.agent.cellId,
    commodityId: e.agent.activeRecipeId,
  }));
}
