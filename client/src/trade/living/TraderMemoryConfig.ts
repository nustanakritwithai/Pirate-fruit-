/** Phase E3 — Trader Memory & Route Learning balance constants */
export const TRADER_MEMORY = {
  saveVersion: 5,

  profitEmaAlpha: 0.25,
  successEmaAlpha: 0.20,
  dangerEmaAlpha: 0.25,
  delayEmaAlpha: 0.20,
  spoilageEmaAlpha: 0.20,

  confidenceGainSuccess: 0.08,
  confidenceGainFailure: 0.05,
  confidenceDecayPerUnusedTick: 0.002,

  minimumConfidence: 0,
  maximumConfidence: 1,

  profitMemoryWeight: 0.55,
  successMemoryWeight: 12,
  dangerMemoryWeight: 10,
  delayMemoryWeight: 0.4,
  spoilageMemoryWeight: 0.8,

  recentFailurePenalty: 8,
  consecutiveFailureMultiplier: 1.25,
  recentSuccessBonus: 3,

  routeAvoidFailureThreshold: 3,
  routeAvoidTicks: 12,

  memoryExpiryTicks: 500,
  maxMemoriesPerTrader: 100,

  newRouteExplorationBonus: 4,

  affinityMin: 0.75,
  affinityMax: 1.25,
  affinityGain: 0.01,
  affinityLoss: 0.01,

  congestionTravelFactor: 0.15,
  congestionScoreWeight: 6,

  emergencyUrgencyOverride: 0.85,
  opportunistProfitOverride: 50,

  personalityPresets: {
    conservative: {
      riskTolerance: 0.25,
      explorationRate: 0.10,
      memoryWeight: 0.75,
      recencyBias: 0.6,
      lossAversion: 1.4,
      avoidFailureThreshold: 2,
    },
    balanced: {
      riskTolerance: 0.50,
      explorationRate: 0.18,
      memoryWeight: 0.60,
      recencyBias: 0.5,
      lossAversion: 1.0,
      avoidFailureThreshold: 3,
    },
    aggressive: {
      riskTolerance: 0.80,
      explorationRate: 0.25,
      memoryWeight: 0.45,
      recencyBias: 0.4,
      lossAversion: 0.7,
      avoidFailureThreshold: 5,
    },
    opportunist: {
      riskTolerance: 0.65,
      explorationRate: 0.35,
      memoryWeight: 0.40,
      recencyBias: 0.55,
      lossAversion: 0.9,
      avoidFailureThreshold: 3,
    },
  },
} as const;

export type TraderPersonality = keyof typeof TRADER_MEMORY.personalityPresets;
