import type { MonsterCellularWorld } from '../../monster/cellular/MonsterCellularWorld';
import {
  computeCombatPressure,
  resolveEmergentRole,
} from '../../monster/cellular/CombatExperienceAdapter';
import type { MonsterCell } from '../../monster/cellular/MonsterCellularTypes';

export interface LiveCellSelection {
  cellId: string;
  index: number;
}

export interface LiveCellDetails {
  index: number;
  cellId: string;
  speciesId: string;
  currentThought: string;
  nextThought: string;
  role: string;
  target?: string;
  neighbors: {
    alert: number;
    attack: number;
    dead: number;
    smoke: number;
    boss: number;
    flee: number;
    hunt: number;
  };
}

export function buildLiveCellDetails(
  world: MonsterCellularWorld,
  selection: LiveCellSelection,
  playerX: number,
  playerZ: number,
): LiveCellDetails | null {
  const cell = world.getCell(selection.cellId);
  if (!cell) return null;
  return cellToDetails(world, cell, selection.index, playerX, playerZ);
}

export function cellToDetails(
  world: MonsterCellularWorld,
  cell: MonsterCell,
  index: number,
  playerX: number,
  playerZ: number,
): LiveCellDetails {
  const snap = world.snapshots.get(cell.id);
  const dist = Math.hypot(cell.position.x - playerX, cell.position.z - playerZ);
  const role = resolveEmergentRole(cell, snap ?? emptySnap(), dist);
  const pressure = snap ? computeCombatPressure(snap) : 0;
  let target: string | undefined;
  if (cell.currentState === 'hunt' || cell.currentState === 'attack') {
    target = 'player';
  } else if (cell.currentState === 'regroup') {
    target = 'pack-center';
  } else if (cell.currentState === 'flee') {
    target = 'away';
  }

  return {
    index,
    cellId: cell.id,
    speciesId: cell.speciesId,
    currentThought: cell.currentState,
    nextThought: cell.nextState,
    role,
    target: target ?? (pressure > 1.2 ? 'combat-zone' : undefined),
    neighbors: {
      alert: snap?.alertInfluence ?? 0,
      attack: snap?.attackInfluence ?? 0,
      dead: snap?.deadInfluence ?? 0,
      smoke: snap?.smokeDensity ?? 0,
      boss: snap?.bossInfluence ?? 0,
      flee: snap?.fleeInfluence ?? 0,
      hunt: snap?.huntInfluence ?? 0,
    },
  };
}

function emptySnap() {
  return {
    idleCount: 0,
    alertCount: 0,
    huntCount: 0,
    attackCount: 0,
    fleeCount: 0,
    regroupCount: 0,
    restCount: 0,
    deadCount: 0,
    idleInfluence: 0,
    alertInfluence: 0,
    huntInfluence: 0,
    attackInfluence: 0,
    fleeInfluence: 0,
    regroupInfluence: 0,
    restInfluence: 0,
    deadInfluence: 0,
    playerNearby: false,
    nearestPlayerDistance: 99,
    playerInAttackRange: false,
    monsterDensity: 0,
    monsterDensityInfluence: 0,
    neighborCount: 0,
    bossInfluence: 0,
    fireInfluence: 0,
    iceInfluence: 0,
    lightningInfluence: 0,
    smokeDensity: 0,
    poisonInfluence: 0,
    earthquakeInfluence: 0,
    areaMovementFactor: 1,
    areaCohesionFactor: 1,
    areaVisionFactor: 1,
  };
}

export function renderLiveCellHtml(details: LiveCellDetails): string {
  return `
    <div class="si-live-cell">
      <div class="si-live-title">Monster #${details.index}</div>
      <div>Current Thought <b>${details.currentThought}</b></div>
      <div>Next Thought <b>${details.nextThought}</b></div>
      <div>Role <b>${details.role}</b></div>
      ${details.target ? `<div>Target <b>${details.target}</b></div>` : ''}
      <div class="si-live-neighbors">
        <div>Alert ${details.neighbors.alert.toFixed(1)}</div>
        <div>Attack ${details.neighbors.attack.toFixed(1)}</div>
        <div>Dead ${details.neighbors.dead.toFixed(1)}</div>
        <div>Smoke ${details.neighbors.smoke.toFixed(1)}</div>
        <div>Boss ${details.neighbors.boss.toFixed(1)}</div>
        <div>Flee ${details.neighbors.flee.toFixed(1)}</div>
      </div>
    </div>`;
}
