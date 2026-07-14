/** Phase E1 — Adaptive Factory balance constants */
export const ADAPTIVE_ECONOMY = {
  saveVersion: 3,

  /** Hysteresis thresholds (finalScore per batch) */
  closeThreshold: -5,
  reopenThreshold: 8,

  /** Consecutive ticks before action */
  unprofitableTicksToReduce: 3,
  unprofitableTicksToPause: 5,
  profitableTicksToExpand: 5,
  profitableTicksToReopen: 4,

  /** Cooldowns (ticks) */
  adaptationCooldownTicks: 3,
  recipeSwitchCooldownTicks: 8,
  retoolingTicks: 2,

  /** outputScale bounds */
  scaleMin: 0.25,
  scaleNormal: 1,
  scaleMax: 1.75,
  scaleStep: 0.1,

  /** Recipe switch must beat current by this ratio */
  recipeSwitchMargin: 1.15,

  /** Expected price blend weights */
  priceWeightCurrent: 0.4,
  priceWeightAverage: 0.4,
  priceWeightDemand: 0.2,

  /** Profit EMA */
  profitEmaAlpha: 0.2,

  /** Penalties */
  shortagePenaltyPerInput: 8,
  oversupplyPenalty: 6,

  /** Workforce */
  laborPoolRatio: 0.32,
  baseWage: 10,
  unemploymentDemandPenalty: 0.15,

  /** Recipe switch retooling cost (Beli equivalent deducted from score memory) */
  recipeSwitchCost: 15,
} as const;
