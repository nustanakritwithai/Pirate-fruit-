import { LIVING_COMMODITY_IDS } from './LivingTradeConfig';
import type { EconomyCellId, EconomyWorldState, LivingCommodityId } from './types';
import type { EconomyGenome, GenomeFitness, GenomeIdentity } from './EconomyGenomeTypes';
import { DEFAULT_GENOME_DEBUG } from './EconomyGenomeConfig';
import { evaluateAllGenomeFitness } from './GenomeFitnessEvaluator';

const NEUTRAL = 0.5;

function defaultFitness(): GenomeFitness {
  return {
    averageProfit: 0.5,
    averageEmployment: 0.5,
    shortageScore: 0.5,
    traderTraffic: 0,
    playerParticipation: 0,
    productionStability: 0.5,
    tradeStability: 0.5,
    marketBalance: 0.5,
    score: 0.5,
    emaScore: 0.5,
    evaluatedTick: 0,
  };
}

function defaultIdentity(): GenomeIdentity {
  return {
    dominantIndustry: null,
    economicStage: 'primitive',
    specializationConfidence: 0,
    genomeGeneration: 0,
    lastMajorShiftTick: 0,
    identityStableTicks: 0,
    candidateIndustry: null,
    candidateStableDrifts: 0,
  };
}

function biasMap(
  overrides: Partial<Record<LivingCommodityId, number>>,
): Partial<Record<LivingCommodityId, number>> {
  const map: Partial<Record<LivingCommodityId, number>> = {};
  for (const id of LIVING_COMMODITY_IDS) {
    map[id] = overrides[id] ?? NEUTRAL - 0.05;
  }
  return map;
}

const CELL_PRODUCTION_BIAS: Record<EconomyCellId, Partial<Record<LivingCommodityId, number>>> = {
  'leaf-island': {
    'fresh-fish': 0.60,
    hardwood: 0.60,
    'dried-fish': 0.52,
    'healing-herb': 0.52,
  },
  'mine-island': {
    'iron-ore': 0.65,
    'iron-ingot': 0.58,
    tools: 0.52,
  },
  'cloth-island': {
    'sun-silk': 0.65,
    rope: 0.58,
    'luxury-cloth': 0.52,
  },
  'shipyard-island': {
    sailcloth: 0.62,
    'repair-kit': 0.55,
  },
};

export function createGenomeForCell(cellId: EconomyCellId): EconomyGenome {
  const productionBias = biasMap(CELL_PRODUCTION_BIAS[cellId] ?? {});
  const consumptionBias = biasMap({});
  const extras = cellId === 'shipyard-island'
    ? { industrialization: 0.58 }
    : {};

  return {
    cellId,
    productionBias,
    consumptionBias,
    storagePreference: NEUTRAL,
    riskTolerance: NEUTRAL,
    tradePreference: NEUTRAL,
    industrialization: extras.industrialization ?? NEUTRAL,
    urbanization: NEUTRAL,
    technology: NEUTRAL,
    populationGrowth: NEUTRAL,
    wealthRetention: NEUTRAL,
    productionVelocity: {},
    consumptionVelocity: {},
    scalarVelocity: {
      storagePreference: 0,
      riskTolerance: 0,
      tradePreference: 0,
      industrialization: 0,
      urbanization: 0,
      technology: 0,
      populationGrowth: 0,
      wealthRetention: 0,
    },
    identity: defaultIdentity(),
    fitness: defaultFitness(),
    lastDriftTick: 0,
    driftCycleCount: 0,
  };
}

export function ensureGenomeState(world: EconomyWorldState): void {
  if (!world.genomeState) {
    world.genomeState = {
      genomes: world.cells.map((c) => createGenomeForCell(c.id)),
      genomePressures: [],
      evolutionHistory: [],
      genomeDebug: { ...DEFAULT_GENOME_DEBUG },
      lastFitnessTick: 0,
      lastDriftTick: 0,
    };
    return;
  }
  const gs = world.genomeState;
  gs.genomes ??= [];
  gs.genomePressures ??= [];
  gs.evolutionHistory ??= [];
  gs.genomeDebug ??= { ...DEFAULT_GENOME_DEBUG };
  if (gs.lastFitnessTick == null) gs.lastFitnessTick = 0;
  if (gs.lastDriftTick == null) gs.lastDriftTick = 0;

  for (const cell of world.cells) {
    if (!gs.genomes.find((g) => g.cellId === cell.id)) {
      gs.genomes.push(createGenomeForCell(cell.id));
    }
  }
}

export function getGenome(world: EconomyWorldState, cellId: EconomyCellId): EconomyGenome {
  ensureGenomeState(world);
  let g = world.genomeState!.genomes.find((x) => x.cellId === cellId);
  if (!g) {
    g = createGenomeForCell(cellId);
    world.genomeState!.genomes.push(g);
  }
  return g;
}

export function clampGenome(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function clampVelocity(v: number): number {
  return Math.max(-0.02, Math.min(0.02, v));
}

export function migrateGenomeFromSave(world: EconomyWorldState): void {
  ensureGenomeState(world);
  for (const genome of world.genomeState!.genomes) {
    genome.identity.specializationConfidence = 0;
    genome.identity.dominantIndustry = null;
    genome.identity.candidateIndustry = null;
    genome.identity.candidateStableDrifts = 0;
  }
  evaluateAllGenomeFitness(world);
}
