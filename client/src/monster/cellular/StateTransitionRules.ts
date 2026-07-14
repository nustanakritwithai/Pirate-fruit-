import { MONSTER_CELLULAR_CONFIG as CFG } from './MonsterCellularConfig';
import type { MonsterCell, MonsterThoughtState, NeighborSnapshot } from './MonsterCellularTypes';

function hpRatio(cell: MonsterCell): number {
  if (cell.maxHp <= 0) return 0;
  return cell.hp / cell.maxHp;
}

function inAlertHuntBand(snapshot: NeighborSnapshot): boolean {
  const band = snapshot.alertCount + snapshot.huntCount;
  return band >= CFG.idleToAlertAlertHuntMin && band <= CFG.idleToAlertAlertHuntMax;
}

export function evaluateNextState(
  cell: MonsterCell,
  snapshot: NeighborSnapshot,
): MonsterThoughtState {
  if (cell.currentState === 'dead' || cell.hp <= 0) return 'dead';

  const lowHp = hpRatio(cell) < CFG.lowHpThreshold;
  const needsRest = cell.energy < CFG.energyRestThreshold
    || cell.hunger > CFG.hungerRestThreshold;

  if (lowHp && cell.currentState !== 'flee' && cell.currentState !== 'regroup') {
    return 'flee';
  }

  switch (cell.currentState) {
    case 'idle':
      if (needsRest && !snapshot.playerNearby) return 'rest';
      if (snapshot.playerNearby && inAlertHuntBand(snapshot)) return 'alert';
      if (snapshot.playerNearby) return 'alert';
      return 'idle';

    case 'rest':
      if (snapshot.playerNearby) return 'alert';
      if (cell.energy >= 0.55 && cell.hunger < 0.5) return 'idle';
      return 'rest';

    case 'alert':
      if (
        snapshot.huntCount >= CFG.alertToHuntHuntMin
        && snapshot.fleeCount <= CFG.alertToHuntFleeMax
      ) {
        return 'hunt';
      }
      if (!snapshot.playerNearby && snapshot.alertCount <= 1) return 'idle';
      return 'alert';

    case 'hunt':
      if (
        snapshot.playerInAttackRange
        && snapshot.attackCount >= CFG.huntToAttackAttackNeighborMin
      ) {
        return 'attack';
      }
      if (
        snapshot.deadCount >= CFG.huntToFleeDeadHigh
        || snapshot.fleeCount >= CFG.huntToFleeFleeHigh
      ) {
        return 'flee';
      }
      if (!snapshot.playerNearby) return 'alert';
      return 'hunt';

    case 'attack':
      if (
        snapshot.fleeCount >= CFG.huntToFleeFleeHigh
        || snapshot.deadCount >= CFG.huntToFleeDeadHigh
      ) {
        return 'flee';
      }
      if (!snapshot.playerInAttackRange) return 'hunt';
      return 'attack';

    case 'flee':
      if (
        snapshot.nearestPlayerDistance >= CFG.fleePlayerFarDistance
        && snapshot.regroupCount >= CFG.fleeToRegroupRegroupMin
      ) {
        return 'regroup';
      }
      return 'flee';

    case 'regroup':
      if (snapshot.playerNearby) return 'alert';
      if (snapshot.monsterDensity >= CFG.regroupToAlertDensityMin) return 'alert';
      return 'regroup';

    default:
      return cell.currentState;
  }
}
