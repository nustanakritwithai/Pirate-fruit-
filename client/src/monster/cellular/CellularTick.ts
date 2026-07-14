import { computeCombatMetrics } from './CombatExperienceAdapter';
import { MONSTER_CELLULAR_CONFIG } from './MonsterCellularConfig';
import { buildNeighborSnapshot } from './NeighborResolver';
import { MonsterRegistry } from './MonsterRegistry';
import { evaluateNextState } from './StateTransitionRules';
import { SpatialGrid } from './SpatialGrid';
import type {
  CellularTickMetrics,
  CombatExperienceMetrics,
  MonsterCell,
  MonsterThoughtState,
  NeighborSnapshot,
} from './MonsterCellularTypes';

export interface CellularTickContext {
  playerX: number;
  playerZ: number;
}

export interface CellularTickResult {
  transitions: number;
  averageNeighborCount: number;
  durationMs: number;
  snapshots: Map<string, NeighborSnapshot>;
  combat: CombatExperienceMetrics;
}

/** Conway two-phase cellular update — read snapshot, compute next, apply together. */
export function runCellularTick(
  registry: MonsterRegistry,
  grid: SpatialGrid,
  context: CellularTickContext,
  tick: number,
): CellularTickResult {
  const t0 = performance.now();
  const allCells = registry.getAll();
  const living = allCells.filter((c) => c.currentState !== 'dead' && c.hp > 0);

  grid.clear();
  for (const cell of allCells) {
    grid.insert(cell);
  }

  const snapshots = new Map<string, ReturnType<typeof buildNeighborSnapshot>>();
  for (const cell of living) {
    snapshots.set(
      cell.id,
      buildNeighborSnapshot(cell, registry, grid, context.playerX, context.playerZ),
    );
  }

  let transitions = 0;
  let neighborSum = 0;
  const nextStates = new Map<string, MonsterThoughtState>();

  for (const cell of living) {
    const snap = snapshots.get(cell.id)!;
    neighborSum += snap.neighborCount;
    const next = evaluateNextState(cell, snap);
    nextStates.set(cell.id, next);
    if (next !== cell.currentState) transitions += 1;
  }

  for (const cell of living) {
    const next = nextStates.get(cell.id)!;
    cell.nextState = next;
  }

  for (const cell of living) {
    if (cell.nextState !== cell.currentState) {
      cell.currentState = cell.nextState;
      cell.lastStateChangeTick = tick;
    }
    cell.energy = Math.max(0, cell.energy - MONSTER_CELLULAR_CONFIG.energyDrainPerTick);
    cell.hunger = Math.min(1, cell.hunger + MONSTER_CELLULAR_CONFIG.hungerGainPerTick);
    if (cell.currentState === 'rest') {
      cell.energy = Math.min(1, cell.energy + MONSTER_CELLULAR_CONFIG.restEnergyGainPerTick);
      cell.hunger = Math.max(0, cell.hunger - MONSTER_CELLULAR_CONFIG.restEnergyGainPerTick * 0.5);
    }
  }

  const durationMs = performance.now() - t0;
  const combat = computeCombatMetrics(snapshots, allCells, durationMs);
  return {
    transitions,
    averageNeighborCount: living.length > 0 ? neighborSum / living.length : 0,
    durationMs,
    snapshots,
    combat,
  };
}

export function emptyMetrics(): CellularTickMetrics {
  return {
    tick: 0,
    monsterCount: 0,
    stateCounts: {
      idle: 0,
      alert: 0,
      hunt: 0,
      attack: 0,
      flee: 0,
      regroup: 0,
      rest: 0,
      dead: 0,
    },
    transitionCount: 0,
    averageNeighborCount: 0,
    lastTickDurationMs: 0,
  };
}

export function metricsFromRegistry(
  registry: MonsterRegistry,
  tick: number,
  transitionCount: number,
  averageNeighborCount: number,
  lastTickDurationMs: number,
  combat?: CombatExperienceMetrics,
): CellularTickMetrics {
  return {
    tick,
    monsterCount: registry.size,
    stateCounts: registry.countByState(),
    transitionCount,
    averageNeighborCount,
    lastTickDurationMs,
    combat,
  };
}

export function syncDeadCells(cells: MonsterCell[]): void {
  for (const cell of cells) {
    if (cell.hp <= 0 && cell.currentState !== 'dead') {
      cell.currentState = 'dead';
      cell.nextState = 'dead';
    }
  }
}
