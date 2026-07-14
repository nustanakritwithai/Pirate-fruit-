/** Phase CE1 — Combat Experience (extends M1 cellular core, no new AI controller) */
export const COMBAT_EXPERIENCE_CONFIG = {
  /** Formation rings around player (meters) */
  alertRing: 8,
  huntRing: 5.5,
  attackRing: 2.2,
  watcherExtraRing: 3,
  flankAngleSpread: 1.4,

  /** Pressure combat — not everyone attacks at once */
  pressureAttackInfluenceMin: 1.5,
  maxSimultaneousAttackers: 2,
  pressureStaggerSlots: 3,

  /** Boss influence (CE1-4) — no leader script */
  bossInfluenceWeight: 3,
  bossFleeResistance: 1.5,
  bossHuntBoost: 0.5,

  /** Combat signals — thought colors when player can read AI */
  combatSignalsRange: 20,

  /** Pack cohesion metric normalization */
  cohesionRadius: 10,
} as const;
