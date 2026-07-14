/** Phase M1 — Conway-style monster cellular AI balance */
export const MONSTER_CELLULAR_CONFIG = {
  tickIntervalMs: 250,
  spatialCellSize: 6,
  defaultPerceptionRadius: 12,
  playerNearbyDistance: 14,

  /** Idle → Alert */
  idleToAlertAlertHuntMin: 1,
  idleToAlertAlertHuntMax: 6,

  /** Alert → Hunt */
  alertToHuntHuntMin: 2,
  alertToHuntFleeMax: 1,

  /** Hunt → Attack */
  huntToAttackAttackNeighborMin: 1,

  /** Hunt → Flee */
  huntToFleeDeadHigh: 2,
  huntToFleeFleeHigh: 3,
  lowHpThreshold: 0.25,

  /** Flee → Regroup */
  fleeToRegroupRegroupMin: 2,
  fleeToRegroupFleeMin: 2,
  fleePlayerFarDistance: 16,

  /** Regroup → Alert */
  regroupToAlertDensityMin: 3,
  regroupPackDistance: 4,

  energyRestThreshold: 0.2,
  hungerRestThreshold: 0.85,
  energyDrainPerTick: 0.01,
  hungerGainPerTick: 0.008,
  restEnergyGainPerTick: 0.06,

  debugMarkerHeight: 3.8,

  /** Weighted cellular automata — boss wakes pack faster without leader script */
  influenceDefault: 1,
  influenceBoss: 2,
} as const;

export const THOUGHT_STATE_COLORS: Record<
  import('./MonsterCellularTypes').MonsterThoughtState,
  number
> = {
  idle: 0x9e9e9e,
  alert: 0xffeb3b,
  hunt: 0xff9800,
  attack: 0xf44336,
  flee: 0x2196f3,
  regroup: 0x4caf50,
  rest: 0x795548,
  dead: 0x111111,
};
