/** Phase E4A — Evolutionary Economy genome balance */
export const ECONOMY_GENOME_CONFIG = {
  saveVersion: 7,

  fitnessEvaluationIntervalTicks: 5,
  genomeDriftIntervalTicks: 5,
  identityEvaluationIntervalDrifts: 10,

  baseDriftRate: 0.005,
  velocityInertia: 0.90,
  pressureAcceleration: 0.10,

  pressureDeadZone: 0.015,
  velocityMin: -0.02,
  velocityMax: 0.02,

  genomeMin: 0,
  genomeMax: 1,

  specializationMinimumBias: 0.60,
  specializationGapRequired: 0.08,
  specializationStableDrifts: 20,

  maximumActivePressuresPerCell: 100,
  maximumPressureLogSamples: 300,
  maximumEvolutionHistoryEntries: 100,

  pressureStrengthMin: -1,
  pressureStrengthMax: 1,
  pressureRemoveThreshold: 0.001,

  factoryDecayRate: 0.997,
  traderDecayRate: 0.996,
  playerDecayRate: 0.994,
  marketDecayRate: 0.998,

  genomeProductionWeight: 4,
  genomeTradeWeight: 2,

  ticksPerGameDay: 24,

  fitnessWeights: {
    averageProfit: 0.25,
    averageEmployment: 0.15,
    shortageScore: 0.15,
    traderTraffic: 0.10,
    playerParticipation: 0.10,
    productionStability: 0.10,
    tradeStability: 0.05,
    marketBalance: 0.10,
  },

  fitnessEmaAlpha: 0.1,
  fitnessMultiplierBase: 0.25,
  fitnessMultiplierScale: 0.75,

  negativePressureBase: 1.25,
  negativePressureFitnessScale: 0.5,

  industrialStageMin: 0.60,
  advancedIndustrialMin: 0.75,
  advancedTechMin: 0.70,
  advancedTradeMin: 0.60,

  fitnessBreakthroughDelta: 0.15,
  fitnessCollapseDelta: 0.20,
} as const;

export const DEFAULT_GENOME_DEBUG = {
  freezeDrift: false,
  freezePressureCollection: false,
  accelMultiplier: 1,
} as const;
