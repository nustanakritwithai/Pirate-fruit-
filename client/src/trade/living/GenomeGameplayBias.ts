import { ECONOMY_GENOME_CONFIG } from './EconomyGenomeConfig';
import { getGenome } from './EconomyGenomeInitializer';
import type { EconomyWorldState, EconomyCellId, LivingCommodityId } from './types';

export function genomeProductionBonus(
  world: EconomyWorldState,
  cellId: EconomyCellId,
  commodityId: LivingCommodityId,
): number {
  const genome = world.genomeState?.genomes.find((g) => g.cellId === cellId);
  if (!genome) return 0;
  const bias = genome.productionBias[commodityId] ?? 0.5;
  return (bias - 0.5) * ECONOMY_GENOME_CONFIG.genomeProductionWeight;
}

export function genomeTradeBonus(
  world: EconomyWorldState,
  sourceCellId: EconomyCellId,
): number {
  const genome = world.genomeState?.genomes.find((g) => g.cellId === sourceCellId);
  if (!genome) return 0;
  return (genome.tradePreference - 0.5) * ECONOMY_GENOME_CONFIG.genomeTradeWeight;
}

export function effectiveTargetStock(
  world: EconomyWorldState,
  cellId: EconomyCellId,
  baseTarget: number,
): number {
  const genome = getGenome(world, cellId);
  const t = genome.storagePreference;
  const min = 0.90;
  const max = 1.15;
  const factor = min + (max - min) * t;
  return baseTarget * factor;
}

export function genomeRiskModifier(
  world: EconomyWorldState,
  cellId: EconomyCellId,
): number {
  const genome = world.genomeState?.genomes.find((g) => g.cellId === cellId);
  if (!genome) return 0;
  return (genome.riskTolerance - 0.5) * 0.1;
}

export function genomeExpansionReadiness(
  world: EconomyWorldState,
  cellId: EconomyCellId,
): number {
  const genome = world.genomeState?.genomes.find((g) => g.cellId === cellId);
  if (!genome) return 0;
  return (genome.industrialization - 0.5) * 2;
}
