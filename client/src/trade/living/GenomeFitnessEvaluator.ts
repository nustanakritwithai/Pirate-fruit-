import { ECONOMY_GENOME_CONFIG } from './EconomyGenomeConfig';
import { getGenome, ensureGenomeState } from './EconomyGenomeInitializer';
import { stockRatio } from './LivingTradeFormulas';
import { LIVING_COMMODITY_IDS } from './LivingTradeConfig';
import { appendEvolutionEvent } from './EvolutionHistory';
import type { EconomyWorldState, EconomyCellId } from './types';
import type { GenomeFitness } from './EconomyGenomeTypes';

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function normPos(v: number, max: number): number {
  return clamp01(v / Math.max(max, 1));
}

export function evaluateGenomeFitness(
  world: EconomyWorldState,
  cellId: EconomyCellId,
): GenomeFitness {
  const cell = world.cells.find((c) => c.id === cellId);
  const genome = getGenome(world, cellId);
  if (!cell) return genome.fitness;

  const factories = world.factories.filter((f) => f.cellId === cellId);
  const profitSum = factories.reduce((s, f) => s + Math.max(0, f.profitEma), 0);
  const averageProfit = normPos(profitSum, factories.length * 30 + 1);

  const pool = Math.floor(cell.population * 0.3) + cell.availableWorkforce;
  const employed = factories.reduce((s, f) => s + f.workforceAssigned, 0);
  const averageEmployment = pool > 0 ? clamp01(employed / pool) : 0.5;

  let shortageCount = 0;
  let balanceSum = 0;
  let commodityCount = 0;
  for (const id of LIVING_COMMODITY_IDS) {
    const item = cell.commodities[id];
    if (!item) continue;
    commodityCount += 1;
    if (item.marketState === 'shortage' || item.marketState === 'crisis') {
      shortageCount += 1;
    }
    const ratio = stockRatio(item, world, cellId);
    balanceSum += 1 - Math.abs(ratio - 1);
  }
  const shortageScore = commodityCount > 0
    ? clamp01(1 - shortageCount / commodityCount)
    : 0.5;
  const marketBalance = commodityCount > 0
    ? clamp01(balanceSum / commodityCount)
    : 0.5;

  const traderTraffic = clamp01(
    (world.orders.filter(
      (o) => (o.sourceIslandId === cellId || o.destinationIslandId === cellId)
        && (o.status === 'completed' || o.status === 'in-transit'),
    ).length) / 5,
  );

  let playerParticipation = 0;
  const pe = world.playerEconomy;
  if (pe) {
    const recent = pe.tradeHistory.filter((h) => h.tick >= world.tick - 50).length;
    playerParticipation = clamp01(recent / 10);
    if (pe.profile.relievedCrisisCount > 0) {
      playerParticipation = clamp01(playerParticipation + 0.1);
    }
  }

  let pauseEvents = 0;
  for (const f of factories) {
    if (f.status === 'paused' || f.lastDecision === 'pause' || f.lastDecision === 'reopen') {
      pauseEvents += 1;
    }
  }
  const productionStability = clamp01(1 - pauseEvents / Math.max(factories.length * 2, 1));

  const failedOrders = world.orders.filter(
    (o) => (o.sourceIslandId === cellId || o.destinationIslandId === cellId)
      && o.status === 'failed',
  ).length;
  const tradeStability = clamp01(1 - failedOrders / 5);

  const w = ECONOMY_GENOME_CONFIG.fitnessWeights;
  const score = clamp01(
    averageProfit * w.averageProfit
    + averageEmployment * w.averageEmployment
    + shortageScore * w.shortageScore
    + traderTraffic * w.traderTraffic
    + playerParticipation * w.playerParticipation
    + productionStability * w.productionStability
    + tradeStability * w.tradeStability
    + marketBalance * w.marketBalance,
  );

  const prevEma = genome.fitness.emaScore ?? score;
  const emaScore = clamp01(
    prevEma * (1 - ECONOMY_GENOME_CONFIG.fitnessEmaAlpha)
    + score * ECONOMY_GENOME_CONFIG.fitnessEmaAlpha,
  );

  const emaDelta = emaScore - prevEma;
  if (emaDelta >= ECONOMY_GENOME_CONFIG.fitnessBreakthroughDelta) {
    appendEvolutionEvent(world, {
      cellId,
      type: 'fitness-breakthrough',
      title: 'เศรษฐกิจฟื้นตัว',
      description: `ความแข็งแกร่งเศรษฐกิจเพิ่มขึ้นอย่างมีนัยสำคัญ (${(emaScore * 100).toFixed(0)}%)`,
      previousValue: Math.round(prevEma * 100),
      newValue: Math.round(emaScore * 100),
      significance: 'medium',
    });
  } else if (prevEma - emaScore >= ECONOMY_GENOME_CONFIG.fitnessCollapseDelta) {
    appendEvolutionEvent(world, {
      cellId,
      type: 'fitness-collapse',
      title: 'เศรษฐกิจอ่อนแอ',
      description: `ความแข็งแกร่งเศรษฐกิจลดลงอย่างรวดเร็ว (${(emaScore * 100).toFixed(0)}%)`,
      previousValue: Math.round(prevEma * 100),
      newValue: Math.round(emaScore * 100),
      significance: 'high',
    });
  }

  const fitness: GenomeFitness = {
    averageProfit,
    averageEmployment,
    shortageScore,
    traderTraffic,
    playerParticipation,
    productionStability,
    tradeStability,
    marketBalance,
    score,
    emaScore,
    evaluatedTick: world.tick,
  };

  genome.fitness = fitness;
  return fitness;
}

export function evaluateAllGenomeFitness(world: EconomyWorldState): void {
  ensureGenomeState(world);
  for (const cell of world.cells) {
    evaluateGenomeFitness(world, cell.id);
  }
  world.genomeState!.lastFitnessTick = world.tick;
}

export function shouldEvaluateFitness(world: EconomyWorldState): boolean {
  ensureGenomeState(world);
  const interval = ECONOMY_GENOME_CONFIG.fitnessEvaluationIntervalTicks;
  return world.tick - world.genomeState!.lastFitnessTick >= interval
    || world.genomeState!.lastFitnessTick === 0;
}
