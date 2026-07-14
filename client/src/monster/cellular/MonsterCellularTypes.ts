/** Phase M1 — Living Monster Cellular AI thought states */
export type MonsterThoughtState =
  | 'idle'
  | 'alert'
  | 'hunt'
  | 'attack'
  | 'flee'
  | 'regroup'
  | 'rest'
  | 'dead';

export interface MonsterCellPosition {
  x: number;
  z: number;
}

export interface MonsterCell {
  id: string;
  speciesId: string;
  position: MonsterCellPosition;
  currentState: MonsterThoughtState;
  nextState: MonsterThoughtState;
  hp: number;
  maxHp: number;
  energy: number;
  hunger: number;
  lastStateChangeTick: number;
  homeX: number;
  homeZ: number;
  attackRange: number;
  perceptionRadius: number;
  moveSpeed: number;
  /** Weighted Conway — contributes this much to neighbor influence sums */
  influenceWeight: number;
}

export interface NeighborSnapshot {
  idleCount: number;
  alertCount: number;
  huntCount: number;
  attackCount: number;
  fleeCount: number;
  regroupCount: number;
  restCount: number;
  deadCount: number;
  idleInfluence: number;
  alertInfluence: number;
  huntInfluence: number;
  attackInfluence: number;
  fleeInfluence: number;
  regroupInfluence: number;
  restInfluence: number;
  deadInfluence: number;
  playerNearby: boolean;
  nearestPlayerDistance: number;
  playerInAttackRange: boolean;
  monsterDensity: number;
  monsterDensityInfluence: number;
  neighborCount: number;
  /** CE1 — boss cells in perception (weighted) */
  bossInfluence: number;
}

export type MonsterLocomotion = 'idle' | 'walk' | 'run' | 'flee' | 'regroup' | 'rest';

export type CombatEmergentRole = 'frontliner' | 'flanker' | 'watcher' | 'retreater';

export interface MonsterBehaviorIntent {
  locomotion: MonsterLocomotion;
  shouldAttack: boolean;
  shouldFacePlayer: boolean;
  speedMultiplier: number;
  returningHome: boolean;
  /** maps to legacy MonsterState for animation */
  legacyState: 'idle' | 'chase' | 'attack' | 'return' | 'dead';
  /** CE1 — emergent combat role from situation */
  combatRole?: CombatEmergentRole;
  /** CE1 — formation move target; when set, chase ring not direct player */
  moveTargetX?: number;
  moveTargetZ?: number;
  /** CE1 — 0..1 pressure felt this tick */
  combatPressure?: number;
}

export interface CombatExperienceMetrics {
  averageAttackInfluence: number;
  averageFleeInfluence: number;
  packCohesion: number;
  combatPressure: number;
  averageDecisionTimeMs: number;
}

export interface CellularTickMetrics {
  tick: number;
  monsterCount: number;
  stateCounts: Record<MonsterThoughtState, number>;
  transitionCount: number;
  averageNeighborCount: number;
  lastTickDurationMs: number;
  combat?: CombatExperienceMetrics;
}

export const THOUGHT_STATES: readonly MonsterThoughtState[] = [
  'idle',
  'alert',
  'hunt',
  'attack',
  'flee',
  'regroup',
  'rest',
  'dead',
] as const;
