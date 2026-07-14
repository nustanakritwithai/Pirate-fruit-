/** Phase E3.5 — Player reputation & influence balance */
export const PLAYER_REPUTATION_CONFIG = {
  saveVersion: 6,

  trustMin: 0,
  trustMax: 100,

  neutralTradeTrustGain: 0.05,

  helpedShortageSupplierGain: 1.0,
  resolvedShortageSupplierGain: 4.0,
  resolvedCrisisSupplierGain: 8.0,

  causedShortageManipulationGain: 4.0,
  causedCrisisManipulationGain: 8.0,
  marketDumpManipulationGain: 3.0,
  marketCorneringManipulationGain: 7.0,

  contractCompleteTrustGain: 5.0,
  contractCompleteReliabilityGain: 8.0,

  contractFailTrustLoss: 4.0,
  contractFailReliabilityLoss: 10.0,

  reputationDecayPer100Ticks: 0.5,

  trustedMerchantThreshold: 35,
  islandSupplierThreshold: 55,
  tradePartnerThreshold: 75,

  marketManipulatorThreshold: 40,
  profiteerThreshold: 65,

  economicSaviorCrisisCount: 5,

  activityWindowTicks: 12,

  marketDumpSellRatio: 0.35,
  marketCorneringBuyRatio: 0.3,

  maxSavedPlayerTradeHistory: 100,
  maxSavedContractsHistory: 50,

  feeNormal: 0.05,
  feeTrustedMerchant: 0.045,
  feeIslandSupplier: 0.04,
  feeTradePartner: 0.035,
  feeMarketManipulator: 0.06,
  feeProfiteer: 0.07,
  feeMin: 0.03,
  feeMax: 0.08,

  perfectDeliveryBonus: 0.15,
  partialDeliveryPenalty: 0.25,
} as const;
