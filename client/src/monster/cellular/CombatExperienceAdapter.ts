import { COMBAT_EXPERIENCE_CONFIG as CE } from './CombatExperienceConfig';
import { MONSTER_CELLULAR_CONFIG } from './MonsterCellularConfig';
import type {
  CombatEmergentRole,
  MonsterBehaviorIntent,
  MonsterCell,
  NeighborSnapshot,
} from './MonsterCellularTypes';

function hash01(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function hpRatio(cell: MonsterCell): number {
  if (cell.maxHp <= 0) return 0;
  return cell.hp / cell.maxHp;
}

function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

function isBossCell(cell: MonsterCell): boolean {
  return cell.influenceWeight >= MONSTER_CELLULAR_CONFIG.influenceBoss
    || cell.speciesId.includes('boss');
}

export function computeCombatPressure(snapshot: NeighborSnapshot): number {
  const aggro = snapshot.attackInfluence + snapshot.huntInfluence + snapshot.alertInfluence * 0.5;
  const fear = snapshot.fleeInfluence + snapshot.deadInfluence + 0.5;
  return aggro / fear;
}

export function resolveEmergentRole(
  cell: MonsterCell,
  _snapshot: NeighborSnapshot,
  distToPlayer: number,
): CombatEmergentRole {
  if (cell.currentState === 'flee' || hpRatio(cell) < MONSTER_CELLULAR_CONFIG.lowHpThreshold) {
    return 'retreater';
  }
  if (
    cell.currentState === 'attack'
    || (cell.currentState === 'hunt' && distToPlayer <= cell.attackRange * 1.8)
  ) {
    return 'frontliner';
  }
  if (cell.currentState === 'alert' || distToPlayer > CE.alertRing) {
    return 'watcher';
  }
  return 'flanker';
}

/** CE1-1 — ring slot around player from stable cell hash (no fixed formation script). */
export function computeFormationTarget(
  cell: MonsterCell,
  playerX: number,
  playerZ: number,
  role: CombatEmergentRole,
): { x: number; z: number } {
  const slot = hash01(cell.id);
  const spread = (hash01(`${cell.id}:flank`) - 0.5) * CE.flankAngleSpread;
  const baseAngle = Math.atan2(
    cell.position.z - playerZ,
    cell.position.x - playerX,
  );
  const slotAngle = baseAngle + spread + (slot - 0.5) * 1.1;

  let ring: number = CE.huntRing;
  if (cell.currentState === 'alert' || role === 'watcher') ring = CE.alertRing + CE.watcherExtraRing * 0.35;
  if (cell.currentState === 'hunt' || role === 'flanker') ring = CE.huntRing;
  if (cell.currentState === 'attack' || role === 'frontliner') ring = CE.attackRing;
  if (role === 'watcher') ring += CE.watcherExtraRing;

  return {
    x: playerX + Math.cos(slotAngle) * ring,
    z: playerZ + Math.sin(slotAngle) * ring,
  };
}

function attackingRank(
  cell: MonsterCell,
  allCells: MonsterCell[],
  playerX: number,
  playerZ: number,
): number {
  const attackers = allCells
    .filter((c) => c.currentState === 'attack' && c.hp > 0)
    .map((c) => ({
      id: c.id,
      d: dist(c.position.x, c.position.z, playerX, playerZ),
    }))
    .sort((a, b) => a.d - b.d || a.id.localeCompare(b.id));
  return attackers.findIndex((a) => a.id === cell.id);
}

/** CE1-2 — pressure gate: pack does not all attack at once. */
export function shouldAttackUnderPressure(
  cell: MonsterCell,
  _snapshot: NeighborSnapshot,
  allCells: MonsterCell[],
  playerX: number,
  playerZ: number,
  tick: number,
): boolean {
  if (cell.currentState !== 'attack') return false;

  const rank = attackingRank(cell, allCells, playerX, playerZ);
  if (rank < 0) return false;
  if (rank < CE.maxSimultaneousAttackers) return true;

  if (_snapshot.attackInfluence < CE.pressureAttackInfluenceMin) return false;

  const phase = (tick + Math.floor(hash01(cell.id) * 100)) % CE.pressureStaggerSlots;
  return phase === tick % CE.pressureStaggerSlots;
}

export function applyCombatExperience(
  cell: MonsterCell,
  snapshot: NeighborSnapshot,
  base: MonsterBehaviorIntent,
  playerX: number,
  playerZ: number,
  allCells: MonsterCell[],
  tick: number,
): MonsterBehaviorIntent {
  if (cell.currentState === 'dead' || cell.currentState === 'rest') return base;
  if (base.locomotion === 'flee' || base.locomotion === 'regroup') {
    return {
      ...base,
      combatRole: 'retreater',
      combatPressure: computeCombatPressure(snapshot),
    };
  }

  const distToPlayer = dist(cell.position.x, cell.position.z, playerX, playerZ);
  const role = resolveEmergentRole(cell, snapshot, distToPlayer);
  const pressure = computeCombatPressure(snapshot);
  const intent: MonsterBehaviorIntent = {
    ...base,
    combatRole: role,
    combatPressure: pressure,
  };

  if (cell.currentState === 'attack') {
    intent.shouldAttack = shouldAttackUnderPressure(
      cell,
      snapshot,
      allCells,
      playerX,
      playerZ,
      tick,
    );
  }

  if (
    cell.currentState === 'alert'
    || cell.currentState === 'hunt'
    || cell.currentState === 'attack'
  ) {
    const target = computeFormationTarget(cell, playerX, playerZ, role);
    intent.moveTargetX = target.x;
    intent.moveTargetZ = target.z;

    if (role === 'watcher') {
      intent.speedMultiplier *= 0.65;
      intent.shouldAttack = false;
    }
    if (role === 'flanker') {
      intent.speedMultiplier *= 0.85;
    }
    if (role === 'frontliner' && cell.currentState === 'hunt') {
      intent.speedMultiplier *= 1.05;
    }
  }

  return intent;
}

export function computePackCohesion(cells: MonsterCell[]): number {
  const living = cells.filter((c) => c.currentState !== 'dead' && c.hp > 0);
  if (living.length < 2) return 1;
  let sx = 0;
  let sz = 0;
  for (const c of living) {
    sx += c.position.x;
    sz += c.position.z;
  }
  const cx = sx / living.length;
  const cz = sz / living.length;
  let sum = 0;
  for (const c of living) {
    sum += dist(c.position.x, c.position.z, cx, cz);
  }
  const avg = sum / living.length;
  return Math.max(0, 1 - avg / CE.cohesionRadius);
}

export function computeCombatMetrics(
  snapshots: Map<string, NeighborSnapshot>,
  cells: MonsterCell[],
  decisionMs: number,
): import('./MonsterCellularTypes').CombatExperienceMetrics {
  const living = cells.filter((c) => c.currentState !== 'dead' && c.hp > 0);
  let attackSum = 0;
  let fleeSum = 0;
  let pressureSum = 0;
  for (const cell of living) {
    const snap = snapshots.get(cell.id);
    if (!snap) continue;
    attackSum += snap.attackInfluence;
    fleeSum += snap.fleeInfluence;
    pressureSum += computeCombatPressure(snap);
  }
  const n = Math.max(1, living.length);
  return {
    averageAttackInfluence: attackSum / n,
    averageFleeInfluence: fleeSum / n,
    packCohesion: computePackCohesion(cells),
    combatPressure: pressureSum / n,
    averageDecisionTimeMs: decisionMs,
  };
}

export { isBossCell };
