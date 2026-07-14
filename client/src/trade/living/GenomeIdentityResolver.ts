import { ECONOMY_GENOME_CONFIG } from './EconomyGenomeConfig';
import { getGenome } from './EconomyGenomeInitializer';
import { LIVING_COMMODITY_IDS } from './LivingTradeConfig';
import { LIVING_COMMODITY_META } from './ProductionRecipes';
import type { EconomyWorldState, EconomyCellId, LivingCommodityId } from './types';
import type { EconomicStage, GenomeIdentity } from './EconomyGenomeTypes';
import { appendEvolutionEvent } from './EvolutionHistory';

function topProductionBiases(
  productionBias: Partial<Record<LivingCommodityId, number>>,
): { top: LivingCommodityId; value: number; second: number } | null {
  let top: LivingCommodityId | null = null;
  let topVal = -1;
  let secondVal = -1;
  for (const id of LIVING_COMMODITY_IDS) {
    const v = productionBias[id] ?? 0.5;
    if (v > topVal) {
      secondVal = topVal;
      topVal = v;
      top = id;
    } else if (v > secondVal) {
      secondVal = v;
    }
  }
  if (!top) return null;
  return { top, value: topVal, second: secondVal < 0 ? 0.5 : secondVal };
}

function resolveStage(
  genome: ReturnType<typeof getGenome>,
  cell: import('./types').EconomyCellState,
  world: EconomyWorldState,
): EconomicStage {
  const cfg = ECONOMY_GENOME_CONFIG;
  const conf = genome.identity.specializationConfidence;
  const factories = world.factories.filter(
    (f) => f.cellId === cell.id && f.status !== 'paused',
  );

  if (
    genome.industrialization >= cfg.advancedIndustrialMin
    && genome.technology >= cfg.advancedTechMin
    && genome.tradePreference >= cfg.advancedTradeMin
    && genome.fitness.emaScore >= 0.55
  ) {
    return 'advanced';
  }

  if (
    genome.industrialization >= cfg.industrialStageMin
    && factories.length > 0
    && genome.fitness.averageEmployment >= 0.35
  ) {
    return 'industrial';
  }

  if (
    conf >= 0.20 - 1e-9
    && genome.identity.dominantIndustry
  ) {
    return 'specializing';
  }

  if (genome.industrialization < 0.30 && genome.technology < 0.30 && conf < 0.20 - 1e-9) {
    return 'primitive';
  }

  return conf >= 0.20 - 1e-9 ? 'specializing' : 'primitive';
}

export function resolveGenomeIdentity(
  world: EconomyWorldState,
  cellId: EconomyCellId,
): GenomeIdentity {
  const genome = getGenome(world, cellId);
  const cell = world.cells.find((c) => c.id === cellId)!;
  const identity = genome.identity;
  const cfg = ECONOMY_GENOME_CONFIG;

  const ranked = topProductionBiases(genome.productionBias);
  if (ranked) {
    identity.specializationConfidence = Math.max(0, ranked.value - ranked.second);
  }

  if (ranked && ranked.value >= cfg.specializationMinimumBias) {
    const gap = ranked.value - (identity.dominantIndustry
      ? (genome.productionBias[identity.dominantIndustry] ?? 0.5)
      : 0);
    const beatsCurrent = !identity.dominantIndustry || ranked.top !== identity.dominantIndustry;

    if (beatsCurrent && gap >= cfg.specializationGapRequired) {
      if (identity.candidateIndustry === ranked.top) {
        identity.candidateStableDrifts += 1;
      } else {
        identity.candidateIndustry = ranked.top;
        identity.candidateStableDrifts = 1;
      }
    } else if (!beatsCurrent) {
      identity.candidateStableDrifts = 0;
      identity.candidateIndustry = null;
    }

    if (
      identity.candidateIndustry
      && identity.candidateStableDrifts >= cfg.specializationStableDrifts
      && identity.candidateIndustry !== identity.dominantIndustry
    ) {
      const prev = identity.dominantIndustry;
      identity.previousDominantIndustry = prev;
      identity.dominantIndustry = identity.candidateIndustry;
      identity.genomeGeneration += 1;
      identity.lastMajorShiftTick = world.tick;
      identity.identityStableTicks = 0;
      identity.candidateStableDrifts = 0;

      appendEvolutionEvent(world, {
        cellId,
        type: prev ? 'dominant-industry-changed' : 'specialization-started',
        title: prev ? 'เปลี่ยนอุตสาหกรรมหลัก' : 'เริ่มเชี่ยวชาญสินค้า',
        description: `${LIVING_COMMODITY_META[identity.dominantIndustry!].label} กลายเป็นสินค้าหลักของเกาะ`,
        previousValue: prev ?? 'none',
        newValue: identity.dominantIndustry,
        relatedCommodityId: identity.dominantIndustry,
        significance: 'high',
      });
    }
  }

  const prevStage = identity.economicStage;
  identity.economicStage = resolveStage(genome, cell, world);
  identity.identityStableTicks += 1;

  if (identity.economicStage !== prevStage) {
    appendEvolutionEvent(world, {
      cellId,
      type: 'economic-stage-changed',
      title: 'เปลี่ยนขั้นวิวัฒนาการ',
      description: `เศรษฐกิจเข้าสู่ช่วง ${identity.economicStage}`,
      previousValue: prevStage,
      newValue: identity.economicStage,
      significance: 'high',
    });
  }

  return identity;
}

export function resolveAllGenomeIdentities(world: EconomyWorldState): void {
  for (const cell of world.cells) {
    const genome = getGenome(world, cell.id);
    if (genome.driftCycleCount % ECONOMY_GENOME_CONFIG.identityEvaluationIntervalDrifts !== 0
      && genome.driftCycleCount > 0) {
      continue;
    }
    if (world.genomeState?.genomeDebug.freezeDrift) continue;
    resolveGenomeIdentity(world, cell.id);
  }
}
