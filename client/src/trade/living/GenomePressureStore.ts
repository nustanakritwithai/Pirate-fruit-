import { ECONOMY_GENOME_CONFIG } from './EconomyGenomeConfig';
import type {
  EconomyGenomeWorldState,
  GenomePressure,
  GenomePressureSource,
  GenomePressureTarget,
} from './EconomyGenomeTypes';
import type { EconomyCellId, EconomyWorldState, LivingCommodityId } from './types';
import { ensureGenomeState } from './EconomyGenomeInitializer';

let pressureCounter = 0;

export function resetPressureCounter(): void {
  pressureCounter = 0;
}

export function pressureKey(
  cellId: EconomyCellId,
  source: GenomePressureSource,
  target: GenomePressureTarget,
  commodityId?: LivingCommodityId,
): string {
  return `${cellId}:${source}:${target}:${commodityId ?? 'none'}`;
}

function decayRateForSource(source: GenomePressureSource): number {
  switch (source) {
    case 'factory': return ECONOMY_GENOME_CONFIG.factoryDecayRate;
    case 'trader': return ECONOMY_GENOME_CONFIG.traderDecayRate;
    case 'player': return ECONOMY_GENOME_CONFIG.playerDecayRate;
    default: return ECONOMY_GENOME_CONFIG.marketDecayRate;
  }
}

export function addPressure(
  world: EconomyWorldState,
  params: {
    cellId: EconomyCellId;
    source: GenomePressureSource;
    target: GenomePressureTarget;
    commodityId?: LivingCommodityId;
    strength: number;
    sourceReferenceId?: string;
  },
): void {
  ensureGenomeState(world);
  const gs = world.genomeState!;
  const key = pressureKey(params.cellId, params.source, params.target, params.commodityId);
  const clamped = Math.max(
    ECONOMY_GENOME_CONFIG.pressureStrengthMin,
    Math.min(ECONOMY_GENOME_CONFIG.pressureStrengthMax, params.strength),
  );
  if (Math.abs(clamped) < 0.0001) return;

  let existing = gs.genomePressures.find(
    (p) => pressureKey(p.cellId, p.source, p.target, p.commodityId) === key,
  );

  if (existing) {
    existing.strength = Math.max(
      ECONOMY_GENOME_CONFIG.pressureStrengthMin,
      Math.min(
        ECONOMY_GENOME_CONFIG.pressureStrengthMax,
        existing.strength + clamped * 0.5,
      ),
    );
    existing.lastUpdatedTick = world.tick;
    return;
  }

  if (gs.genomePressures.filter((p) => p.cellId === params.cellId).length
    >= ECONOMY_GENOME_CONFIG.maximumActivePressuresPerCell) {
    return;
  }

  pressureCounter += 1;
  gs.genomePressures.push({
    id: `gpress-${pressureCounter}`,
    cellId: params.cellId,
    source: params.source,
    target: params.target,
    commodityId: params.commodityId,
    strength: clamped,
    createdTick: world.tick,
    lastUpdatedTick: world.tick,
    decayRate: decayRateForSource(params.source),
    sourceReferenceId: params.sourceReferenceId,
  });
}

export function decayAndPrunePressures(world: EconomyWorldState): void {
  ensureGenomeState(world);
  const gs = world.genomeState!;
  const threshold = ECONOMY_GENOME_CONFIG.pressureRemoveThreshold;

  gs.genomePressures = gs.genomePressures.filter((p) => {
    p.strength *= p.decayRate;
    return Math.abs(p.strength) >= threshold;
  });
}

export function clearPressures(world: EconomyWorldState, cellId?: EconomyCellId): void {
  ensureGenomeState(world);
  if (cellId) {
    world.genomeState!.genomePressures = world.genomeState!.genomePressures
      .filter((p) => p.cellId !== cellId);
  } else {
    world.genomeState!.genomePressures = [];
  }
}

export function getPressuresForCell(
  world: EconomyWorldState,
  cellId: EconomyCellId,
): GenomePressure[] {
  ensureGenomeState(world);
  return world.genomeState!.genomePressures.filter((p) => p.cellId === cellId);
}

export function sumPressureForTarget(
  pressures: GenomePressure[],
  target: GenomePressureTarget,
  commodityId?: LivingCommodityId,
): number {
  return pressures
    .filter((p) => p.target === target
      && (commodityId == null ? !p.commodityId : p.commodityId === commodityId))
    .reduce((s, p) => s + p.strength, 0);
}

export function getGenomeState(world: EconomyWorldState): EconomyGenomeWorldState {
  ensureGenomeState(world);
  return world.genomeState!;
}
