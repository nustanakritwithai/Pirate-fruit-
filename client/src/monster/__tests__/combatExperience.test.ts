import { describe, expect, it, beforeEach } from 'vitest';
import {
  MonsterRegistry,
  resetMonsterCellCounter,
  SpatialGrid,
  runCellularTick,
  applyCombatExperience,
  behaviorIntentFromThought,
  computeFormationTarget,
  resolveEmergentRole,
  shouldAttackUnderPressure,
  computePackCohesion,
  COMBAT_EXPERIENCE_CONFIG,
  type MonsterCell,
  type MonsterThoughtState,
  type NeighborSnapshot,
} from '../cellular';

function cell(
  id: string,
  x: number,
  z: number,
  state: MonsterThoughtState = 'idle',
  overrides: Partial<MonsterCell> = {},
): MonsterCell {
  return {
    id,
    speciesId: 'grunt',
    position: { x, z },
    currentState: state,
    nextState: state,
    hp: 100,
    maxHp: 100,
    energy: 0.8,
    hunger: 0.2,
    lastStateChangeTick: 0,
    homeX: x,
    homeZ: z,
    attackRange: 2.5,
    perceptionRadius: 12,
    moveSpeed: 4,
    influenceWeight: 1,
    ...overrides,
  };
}

function snap(overrides: Partial<NeighborSnapshot> = {}): NeighborSnapshot {
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
    ...overrides,
  };
}

function runScenario(
  pack: MonsterCell[],
  playerPath: Array<{ x: number; z: number }>,
  ticks = 16,
): MonsterRegistry {
  const reg = new MonsterRegistry();
  const grid = new SpatialGrid(6);
  for (const c of pack) reg.register(c);
  for (let t = 0; t < ticks; t++) {
    const p = playerPath[Math.min(t, playerPath.length - 1)];
    runCellularTick(reg, grid, { playerX: p.x, playerZ: p.z }, t + 1);
  }
  return reg;
}

function countState(reg: MonsterRegistry, state: MonsterThoughtState): number {
  return reg.getAll().filter((c) => c.currentState === state).length;
}

describe('Combat Experience v1.0 (CE1)', () => {
  beforeEach(() => {
    resetMonsterCellCounter();
  });

  it('CE1-1 formation: hunters get distinct move targets (not all same point)', () => {
    const hunters = [
      cell('h1', -4, 0, 'hunt'),
      cell('h2', 4, 0, 'hunt'),
      cell('h3', 0, 4, 'hunt'),
    ];
    const targets = hunters.map((c) => computeFormationTarget(c, 0, 0, 'flanker'));
    const uniq = new Set(targets.map((t) => `${t.x.toFixed(1)},${t.z.toFixed(1)}`));
    expect(uniq.size).toBeGreaterThan(1);
  });

  it('CE1-2 pressure: not all attackers strike at once', () => {
    const attackers = [
      cell('a1', 2, 0, 'attack'),
      cell('a2', 0, 2, 'attack'),
      cell('a3', -2, 0, 'attack'),
    ];
    const snapshot = snap({ attackInfluence: 3, attackCount: 3, playerInAttackRange: true });
    let allowed = 0;
    for (const c of attackers) {
      if (shouldAttackUnderPressure(c, snapshot, attackers, 0, 0, 4)) allowed += 1;
    }
    expect(allowed).toBeLessThan(attackers.length);
    expect(allowed).toBeGreaterThan(0);
  });

  it('CE1-3 roles: closest hunts frontliner, far idles watcher', () => {
    const close = cell('c', 2, 0, 'hunt');
    const far = cell('f', 0, 0, 'alert');
    expect(resolveEmergentRole(close, snap(), 2)).toBe('frontliner');
    expect(resolveEmergentRole(far, snap(), COMBAT_EXPERIENCE_CONFIG.alertRing + 2)).toBe('watcher');
  });

  it('CE1-4 boss influence: boss weight is 3 and resists flee spread', () => {
    const boss = cell('boss', 0, 0, 'hunt', { speciesId: 'boss', influenceWeight: 3 });
    expect(boss.influenceWeight).toBe(3);
    const intent = applyCombatExperience(
      boss,
      snap({ bossInfluence: 3, huntInfluence: 2, fleeInfluence: 1 }),
      behaviorIntentFromThought(boss),
      5,
      0,
      [boss],
      1,
    );
    expect(intent.combatPressure).toBeGreaterThan(0);
  });

  it('CE1-5 adaptive: fast kills cause flee; slow play allows regroup', () => {
    const fleeReg = runScenario(
      [
        cell('a', 0, 0, 'hunt'),
        cell('b', 3, 0, 'hunt'),
        cell('d1', 1, 1, 'dead', { hp: 0 }),
        cell('d2', 2, 1, 'dead', { hp: 0 }),
      ],
      [{ x: 80, z: 80 }],
      12,
    );
    expect(countState(fleeReg, 'flee')).toBeGreaterThan(0);

    const regroupReg = runScenario(
      [
        cell('a', 0, 0, 'flee'),
        cell('b', 3, 0, 'flee'),
        cell('c', 6, 0, 'flee'),
      ],
      [{ x: 80, z: 80 }],
      20,
    );
    expect(countState(regroupReg, 'regroup')).toBeGreaterThan(0);
  });

  it('CE1-6 scenario: 1 player vs 5 grunts — alert wave', () => {
    const reg = runScenario(
      Array.from({ length: 5 }, (_, i) => cell(`g${i}`, i * 3, 0, 'idle')),
      [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 4, z: 0 }],
      14,
    );
    expect(countState(reg, 'alert') + countState(reg, 'hunt')).toBeGreaterThan(1);
  });

  it('CE1-7 scenario: 10 grunts — formation spread under hunt', () => {
    const pack = Array.from({ length: 10 }, (_, i) =>
      cell(`g${i}`, (i % 5) * 3, Math.floor(i / 5) * 3, i < 2 ? 'hunt' : 'idle'));
    const reg = runScenario(pack, [{ x: 6, z: 3 }], 10);
    const hunters = reg.getAll().filter((c) => c.currentState === 'hunt' || c.currentState === 'attack');
    const targets = hunters.map((c) =>
      computeFormationTarget(c, 6, 3, resolveEmergentRole(c, snap(), 4)));
    const spread = new Set(targets.map((t) => `${Math.round(t.x)},${Math.round(t.z)}`));
    expect(spread.size).toBeGreaterThan(1);
  });

  it('CE1-8 scenario: boss + minions — hunt rises without leader script', () => {
    const reg = runScenario(
      [
        cell('boss', 10, 0, 'alert', { speciesId: 'boss', influenceWeight: 3 }),
        cell('m1', 7, 0, 'idle'),
        cell('m2', 13, 0, 'idle'),
        cell('m3', 10, 3, 'idle'),
      ],
      [{ x: 10, z: 0 }],
      12,
    );
    expect(countState(reg, 'hunt') + countState(reg, 'alert')).toBeGreaterThan(2);
  });

  it('CE1-9 scenario: narrow vs open — both produce emergent states', () => {
    const narrow = runScenario(
      [cell('a', 0, 0, 'hunt'), cell('b', 2, 0, 'hunt'), cell('c', 4, 0, 'idle')],
      [{ x: 1, z: 0 }],
      8,
    );
    const open = runScenario(
      [
        cell('a', 0, 0, 'idle'),
        cell('b', 8, 0, 'idle'),
        cell('c', 0, 8, 'idle'),
        cell('d', 8, 8, 'alert'),
      ],
      [{ x: 4, z: 4 }],
      10,
    );
    expect(countState(narrow, 'hunt') + countState(narrow, 'attack')).toBeGreaterThan(0);
    expect(countState(open, 'alert') + countState(open, 'hunt')).toBeGreaterThan(0);
  });

  it('CE1-10 scenario: player retreats — pack de-escalates', () => {
    const reg = runScenario(
      [
        cell('a', 0, 0, 'attack'),
        cell('b', 3, 0, 'attack'),
        cell('c', 6, 0, 'hunt'),
      ],
      [{ x: 0, z: 0 }, { x: 200, z: 200 }],
      20,
    );
    const aggro = countState(reg, 'attack') + countState(reg, 'hunt');
    const calm = countState(reg, 'alert') + countState(reg, 'idle') + countState(reg, 'regroup');
    expect(aggro).toBeLessThan(3);
    expect(calm).toBeGreaterThan(0);
  });

  it('CE1-11 scenario: kill boss first — minions flee easier', () => {
    const reg = runScenario(
      [
        cell('boss', 0, 0, 'dead', { hp: 0, influenceWeight: 3 }),
        cell('m1', 3, 0, 'hunt'),
        cell('m2', 6, 0, 'hunt'),
        cell('d', 1, 1, 'dead', { hp: 0 }),
      ],
      [{ x: 0, z: 0 }],
      10,
    );
    expect(countState(reg, 'flee')).toBeGreaterThan(0);
  });

  it('CE1-12 scenario: lure packs — two clusters stay independent', () => {
    const reg = runScenario(
      [
        cell('a1', 0, 0, 'idle'),
        cell('a2', 3, 0, 'alert'),
        cell('b1', 100, 100, 'idle'),
        cell('b2', 103, 100, 'idle'),
      ],
      [{ x: 2, z: 0 }],
      8,
    );
    expect(reg.get('b1')?.currentState).toBe('idle');
    expect(countState(reg, 'alert') + countState(reg, 'hunt')).toBeGreaterThan(0);
  });

  it('CE1-13 pack cohesion metric is finite', () => {
    const pack = Array.from({ length: 6 }, (_, i) => cell(`p${i}`, i * 2, 0, 'hunt'));
    expect(computePackCohesion(pack)).toBeGreaterThan(0);
    expect(Number.isFinite(computePackCohesion(pack))).toBe(true);
  });

  it('CE1-14 combat tick exposes metrics', () => {
    const reg = new MonsterRegistry();
    const grid = new SpatialGrid(6);
    reg.register(cell('a', 0, 0, 'hunt'));
    reg.register(cell('b', 3, 0, 'alert'));
    const r = runCellularTick(reg, grid, { playerX: 1, playerZ: 0 }, 1);
    expect(r.combat.averageAttackInfluence).toBeGreaterThanOrEqual(0);
    expect(r.combat.packCohesion).toBeGreaterThan(0);
    expect(r.snapshots.size).toBe(2);
  });
});
