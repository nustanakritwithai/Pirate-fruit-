import { MONSTER_CELLULAR_CONFIG } from './MonsterCellularConfig';
import type { MonsterCell, NeighborSnapshot } from './MonsterCellularTypes';
import type { MonsterRegistry } from './MonsterRegistry';
import type { SpatialGrid } from './SpatialGrid';

function dist2(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.hypot(dx, dz);
}

export function buildNeighborSnapshot(
  cell: MonsterCell,
  registry: MonsterRegistry,
  grid: SpatialGrid,
  playerX: number,
  playerZ: number,
): NeighborSnapshot {
  const radius = cell.perceptionRadius;
  const candidateIds = grid.queryNearby(cell.position.x, cell.position.z, radius);
  const snapshot: NeighborSnapshot = {
    idleCount: 0,
    alertCount: 0,
    huntCount: 0,
    attackCount: 0,
    fleeCount: 0,
    regroupCount: 0,
    restCount: 0,
    deadCount: 0,
    playerNearby: false,
    nearestPlayerDistance: Infinity,
    playerInAttackRange: false,
    monsterDensity: 0,
    neighborCount: 0,
  };

  for (const id of candidateIds) {
    if (id === cell.id) continue;
    const other = registry.get(id);
    if (!other) continue;
    const d = dist2(cell.position.x, cell.position.z, other.position.x, other.position.z);
    if (d > radius) continue;
    snapshot.neighborCount += 1;
    snapshot.monsterDensity += 1;
    switch (other.currentState) {
      case 'idle': snapshot.idleCount += 1; break;
      case 'alert': snapshot.alertCount += 1; break;
      case 'hunt': snapshot.huntCount += 1; break;
      case 'attack': snapshot.attackCount += 1; break;
      case 'flee': snapshot.fleeCount += 1; break;
      case 'regroup': snapshot.regroupCount += 1; break;
      case 'rest': snapshot.restCount += 1; break;
      case 'dead': snapshot.deadCount += 1; break;
      default: break;
    }
  }

  const playerDist = dist2(cell.position.x, cell.position.z, playerX, playerZ);
  snapshot.nearestPlayerDistance = playerDist;
  snapshot.playerNearby = playerDist <= MONSTER_CELLULAR_CONFIG.playerNearbyDistance;
  snapshot.playerInAttackRange = playerDist <= cell.attackRange;

  return snapshot;
}
