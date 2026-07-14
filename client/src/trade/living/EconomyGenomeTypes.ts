import type { EconomyCellId, LivingCommodityId } from './types';

export type EconomicStage =
  | 'primitive'
  | 'specializing'
  | 'industrial'
  | 'advanced';

export type GenomePressureSource = 'factory' | 'trader' | 'player' | 'market';

export type GenomePressureTarget =
  | 'production-bias'
  | 'consumption-bias'
  | 'storage-preference'
  | 'risk-tolerance'
  | 'trade-preference'
  | 'industrialization'
  | 'urbanization'
  | 'technology'
  | 'population-growth'
  | 'wealth-retention';

export interface GenomeScalarVelocity {
  storagePreference: number;
  riskTolerance: number;
  tradePreference: number;
  industrialization: number;
  urbanization: number;
  technology: number;
  populationGrowth: number;
  wealthRetention: number;
}

export interface GenomeIdentity {
  dominantIndustry: LivingCommodityId | null;
  economicStage: EconomicStage;
  specializationConfidence: number;
  genomeGeneration: number;
  lastMajorShiftTick: number;
  previousDominantIndustry?: LivingCommodityId | null;
  identityStableTicks: number;
  candidateIndustry?: LivingCommodityId | null;
  candidateStableDrifts: number;
}

export interface GenomeFitness {
  averageProfit: number;
  averageEmployment: number;
  shortageScore: number;
  traderTraffic: number;
  playerParticipation: number;
  productionStability: number;
  tradeStability: number;
  marketBalance: number;
  score: number;
  emaScore: number;
  evaluatedTick: number;
}

export interface EconomyGenome {
  cellId: EconomyCellId;
  productionBias: Partial<Record<LivingCommodityId, number>>;
  consumptionBias: Partial<Record<LivingCommodityId, number>>;
  storagePreference: number;
  riskTolerance: number;
  tradePreference: number;
  industrialization: number;
  urbanization: number;
  technology: number;
  populationGrowth: number;
  wealthRetention: number;
  productionVelocity: Partial<Record<LivingCommodityId, number>>;
  consumptionVelocity: Partial<Record<LivingCommodityId, number>>;
  scalarVelocity: GenomeScalarVelocity;
  identity: GenomeIdentity;
  fitness: GenomeFitness;
  lastDriftTick: number;
  driftCycleCount: number;
}

export interface GenomePressure {
  id: string;
  cellId: EconomyCellId;
  source: GenomePressureSource;
  target: GenomePressureTarget;
  commodityId?: LivingCommodityId;
  strength: number;
  createdTick: number;
  lastUpdatedTick: number;
  decayRate: number;
  sourceReferenceId?: string;
}

export type EvolutionEventType =
  | 'specialization-started'
  | 'dominant-industry-changed'
  | 'economic-stage-changed'
  | 'industrialization-rising'
  | 'industrialization-falling'
  | 'trade-orientation-rising'
  | 'storage-strategy-changed'
  | 'fitness-breakthrough'
  | 'fitness-collapse';

export interface EvolutionHistoryEntry {
  id: string;
  cellId: EconomyCellId;
  tick: number;
  day?: number;
  type: EvolutionEventType;
  title: string;
  description: string;
  previousValue?: string | number;
  newValue?: string | number;
  relatedCommodityId?: LivingCommodityId;
  significance: 'low' | 'medium' | 'high';
}

export interface GenomeDebugState {
  freezeDrift: boolean;
  freezePressureCollection: boolean;
  accelMultiplier: number;
}

export interface EconomyGenomeWorldState {
  genomes: EconomyGenome[];
  genomePressures: GenomePressure[];
  evolutionHistory: EvolutionHistoryEntry[];
  genomeDebug: GenomeDebugState;
  lastFitnessTick: number;
  lastDriftTick: number;
}
