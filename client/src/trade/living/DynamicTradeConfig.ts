/** Phase E2 — Dynamic Trade Orders balance constants */
export const DYNAMIC_TRADE = {
  saveVersion: 4,

  shortageThreshold: 0.6,
  crisisThreshold: 0.3,
  exportSurplusThreshold: 1.2,

  orderCooldownTicks: 3,
  orderExpiryTicks: 20,

  minimumExpectedProfit: 5,
  minimumProfitPerSlot: 1,

  urgencyWeight: 0.6,
  riskWeight: 0.8,
  travelTimeWeight: 0.25,
  spoilageWeight: 1.0,
  profitWeight: 1.0,

  maxOpenOrdersPerCommodity: 3,
  maxOpenOrdersPerIsland: 8,

  reservationTimeoutTicks: 5,
  maxOrderAmountPerTick: 12,

  /** กำไรต่อสล็อตสูงพอ → toast */
  highProfitToastThreshold: 35,

  /** danger เริ่มต้นต่อเส้นทาง */
  baseRouteDanger: 0.15,
  routeDangerPerFailure: 0.05,
} as const;
