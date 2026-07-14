/** Phase E3.5 — Player trade contracts balance */
export const PLAYER_CONTRACT_CONFIG = {
  contractUrgencyThreshold: 45,
  emergencyUrgencyThreshold: 75,

  minimumOrderAmount: 3,

  maxAvailableContracts: 8,
  maxActiveContractsPerPlayer: 2,

  standardExpiryTicks: 30,
  emergencyExpiryTicks: 16,

  collateralRate: 0.15,

  baseRewardMultiplier: 1.10,
  emergencyRewardMultiplier: 1.35,

  minimumDeliveryRatio: 0.8,

  npcAssignmentDelayTicks: 3,
  playerReservationTicks: 5,
} as const;
