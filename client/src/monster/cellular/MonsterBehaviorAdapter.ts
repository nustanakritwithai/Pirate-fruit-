import { MONSTER_CELLULAR_CONFIG } from './MonsterCellularConfig';
import type { MonsterBehaviorIntent } from './MonsterCellularTypes';
import type { MonsterCell } from './MonsterCellularTypes';

export function behaviorIntentFromThought(cell: MonsterCell): MonsterBehaviorIntent {
  switch (cell.currentState) {
    case 'alert':
      return {
        locomotion: 'walk',
        shouldAttack: false,
        shouldFacePlayer: true,
        speedMultiplier: 0.55,
        returningHome: false,
        legacyState: 'idle',
      };
    case 'hunt':
      return {
        locomotion: 'run',
        shouldAttack: false,
        shouldFacePlayer: true,
        speedMultiplier: 1,
        returningHome: false,
        legacyState: 'chase',
      };
    case 'attack':
      return {
        locomotion: 'idle',
        shouldAttack: true,
        shouldFacePlayer: true,
        speedMultiplier: 0.2,
        returningHome: false,
        legacyState: 'attack',
      };
    case 'flee':
      return {
        locomotion: 'flee',
        shouldAttack: false,
        shouldFacePlayer: false,
        speedMultiplier: 1.25,
        returningHome: false,
        legacyState: 'chase',
      };
    case 'regroup':
      return {
        locomotion: 'regroup',
        shouldAttack: false,
        shouldFacePlayer: false,
        speedMultiplier: 0.7,
        returningHome: true,
        legacyState: 'return',
      };
    case 'rest':
      return {
        locomotion: 'rest',
        shouldAttack: false,
        shouldFacePlayer: false,
        speedMultiplier: 0,
        returningHome: false,
        legacyState: 'idle',
      };
    case 'dead':
      return {
        locomotion: 'idle',
        shouldAttack: false,
        shouldFacePlayer: false,
        speedMultiplier: 0,
        returningHome: false,
        legacyState: 'dead',
      };
    case 'idle':
    default:
      return {
        locomotion: 'idle',
        shouldAttack: false,
        shouldFacePlayer: false,
        speedMultiplier: 0.35,
        returningHome: false,
        legacyState: 'idle',
      };
  }
}

export function regroupTarget(
  cell: MonsterCell,
  packCenter: { x: number; z: number } | null,
): { x: number; z: number } {
  if (packCenter) return packCenter;
  return { x: cell.homeX, z: cell.homeZ };
}

export function fleeDirection(
  cellX: number,
  cellZ: number,
  playerX: number,
  playerZ: number,
): { dx: number; dz: number } {
  const dx = cellX - playerX;
  const dz = cellZ - playerZ;
  const len = Math.hypot(dx, dz);
  if (len < 0.001) {
    const angle = (cellX * 12.9898 + cellZ * 78.233) % (Math.PI * 2);
    return { dx: Math.cos(angle), dz: Math.sin(angle) };
  }
  return { dx: dx / len, dz: dz / len };
}

export function restEnergyGain(): number {
  return MONSTER_CELLULAR_CONFIG.restEnergyGainPerTick;
}
