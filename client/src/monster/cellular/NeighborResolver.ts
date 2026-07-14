import { isBossCell } from './CombatExperienceAdapter';
import { MONSTER_CELLULAR_CONFIG } from './MonsterCellularConfig';
import type { AreaInfluenceSample } from '../../devilfruit/influence/DevilFruitInfluenceTypes';
import { applyAreaToNeighborInfluence } from '../../devilfruit/influence/AreaInfluenceResolver';
import type { MonsterCell, NeighborSnapshot } from './MonsterCellularTypes';
import type { MonsterRegistry } from './MonsterRegistry';
import type { SpatialGrid } from './SpatialGrid';

function dist2(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.hypot(dx, dz);
}

function emptySnapshot(): NeighborSnapshot {
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
    nearestPlayerDistance: Infinity,
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

function addNeighborInfluence(
  snapshot: NeighborSnapshot,
  state: MonsterCell['currentState'],
  weight: number,
): void {
  snapshot.neighborCount += 1;
  snapshot.monsterDensity += 1;
  snapshot.monsterDensityInfluence += weight;
  switch (state) {
    case 'idle':
      snapshot.idleCount += 1;
      snapshot.idleInfluence += weight;
      break;
    case 'alert':
      snapshot.alertCount += 1;
      snapshot.alertInfluence += weight;
      break;
    case 'hunt':
      snapshot.huntCount += 1;
      snapshot.huntInfluence += weight;
      break;
    case 'attack':
      snapshot.attackCount += 1;
      snapshot.attackInfluence += weight;
      break;
    case 'flee':
      snapshot.fleeCount += 1;
      snapshot.fleeInfluence += weight;
      break;
    case 'regroup':
      snapshot.regroupCount += 1;
      snapshot.regroupInfluence += weight;
      break;
    case 'rest':
      snapshot.restCount += 1;
      snapshot.restInfluence += weight;
      break;
    case 'dead':
      snapshot.deadCount += 1;
      snapshot.deadInfluence += weight;
      break;
    default:
      break;
  }
}

export function buildNeighborSnapshot(
  cell: MonsterCell,
  registry: MonsterRegistry,
  grid: SpatialGrid,
  playerX: number,
  playerZ: number,
  sampleArea?: (x: number, z: number) => AreaInfluenceSample,
): NeighborSnapshot {
  const radius = cell.perceptionRadius;
  const candidateIds = grid.queryNearby(cell.position.x, cell.position.z, radius);
  const snapshot = emptySnapshot();

  for (const id of candidateIds) {
    if (id === cell.id) continue;
    const other = registry.get(id);
    if (!other) continue;
    const d = dist2(cell.position.x, cell.position.z, other.position.x, other.position.z);
    if (d > radius) continue;
    addNeighborInfluence(snapshot, other.currentState, other.influenceWeight);
    if (isBossCell(other)) {
      snapshot.bossInfluence += other.influenceWeight;
    }
  }

  const playerDist = dist2(cell.position.x, cell.position.z, playerX, playerZ);
  snapshot.nearestPlayerDistance = playerDist;
  snapshot.playerNearby = playerDist <= MONSTER_CELLULAR_CONFIG.playerNearbyDistance;
  snapshot.playerInAttackRange = playerDist <= cell.attackRange;

  if (sampleArea) {
    applyAreaToNeighborInfluence(snapshot, sampleArea(cell.position.x, cell.position.z));
  }

  return snapshot;
}
