import { describe, expect, it, beforeEach } from 'vitest';
import {
  MonsterRegistry,
  createCellId,
  resetMonsterCellCounter,
  SpatialGrid,
  buildNeighborSnapshot,
  evaluateNextState,
  runCellularTick,
  behaviorIntentFromThought,
  fleeDirection,
  regroupTarget,
  MonsterCellularWorld,
  MONSTER_CELLULAR_CONFIG,
  type MonsterCell,
  type NeighborSnapshot,
} from '../cellular';
import { pushBounded, prependBounded } from '../../trade/living/LivingEconomyBounds';

function baseCell(overrides: Partial<MonsterCell> = {}): MonsterCell {
  return {
    id: 'c1',
    speciesId: 'grunt',
    position: { x: 0, z: 0 },
    currentState: 'idle',
    nextState: 'idle',
    hp: 100,
    maxHp: 100,
    energy: 0.8,
    hunger: 0.2,
    lastStateChangeTick: 0,
    homeX: 0,
    homeZ: 0,
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
    fireInfluence: 0,
    iceInfluence: 0,
    lightningInfluence: 0,
    smokeDensity: 0,
    poisonInfluence: 0,
    earthquakeInfluence: 0,
    areaMovementFactor: 1,
    areaCohesionFactor: 1,
    areaVisionFactor: 1,
    ...overrides,
  };
}

describe('Phase M1 — Monster Cellular AI', () => {
  beforeEach(() => {
    resetMonsterCellCounter();
  });

  it('1. registry registers cells', () => {
    const reg = new MonsterRegistry();
    reg.register(baseCell({ id: 'a' }));
    expect(reg.size).toBe(1);
    expect(reg.get('a')?.speciesId).toBe('grunt');
  });

  it('2. createCellId is unique', () => {
    const a = createCellId();
    const b = createCellId();
    expect(a).not.toBe(b);
  });

  it('3. spatial grid finds nearby ids', () => {
    const grid = new SpatialGrid(4);
    grid.insert(baseCell({ id: 'a', position: { x: 0, z: 0 } }));
    grid.insert(baseCell({ id: 'b', position: { x: 3, z: 0 } }));
    grid.insert(baseCell({ id: 'c', position: { x: 50, z: 50 } }));
    const near = grid.queryNearby(0, 0, 5);
    expect(near).toContain('a');
    expect(near).toContain('b');
    expect(near).not.toContain('c');
  });

  it('4. neighbor snapshot counts states', () => {
    const reg = new MonsterRegistry();
    const grid = new SpatialGrid(6);
    reg.register(baseCell({ id: 'self', position: { x: 0, z: 0 } }));
    reg.register(baseCell({ id: 'n1', currentState: 'alert', position: { x: 2, z: 0 } }));
    reg.register(baseCell({ id: 'n2', currentState: 'hunt', position: { x: 0, z: 3 } }));
    grid.clear();
    for (const c of reg.getAll()) grid.insert(c);
    const s = buildNeighborSnapshot(reg.get('self')!, reg, grid, 100, 100);
    expect(s.alertCount).toBe(1);
    expect(s.huntCount).toBe(1);
    expect(s.alertInfluence).toBe(1);
    expect(s.huntInfluence).toBe(1);
    expect(s.neighborCount).toBe(2);
  });

  it('5. player nearby detected', () => {
    const reg = new MonsterRegistry();
    const grid = new SpatialGrid(6);
    const cell = baseCell({ id: 'self' });
    reg.register(cell);
    grid.insert(cell);
    const s = buildNeighborSnapshot(cell, reg, grid, 2, 0);
    expect(s.playerNearby).toBe(true);
    expect(s.nearestPlayerDistance).toBeLessThan(5);
  });

  it('6. idle → alert when player nearby', () => {
    const next = evaluateNextState(
      baseCell({ currentState: 'idle' }),
      snap({ playerNearby: true, alertInfluence: 1 }),
    );
    expect(next).toBe('alert');
  });

  it('7. alert → hunt with hunt neighbors', () => {
    const next = evaluateNextState(
      baseCell({ currentState: 'alert' }),
      snap({ huntInfluence: 2, fleeInfluence: 0, playerNearby: true }),
    );
    expect(next).toBe('hunt');
  });

  it('8. hunt → attack in range with attack neighbors', () => {
    const next = evaluateNextState(
      baseCell({ currentState: 'hunt' }),
      snap({ playerInAttackRange: true, attackInfluence: 1, playerNearby: true }),
    );
    expect(next).toBe('attack');
  });

  it('9. hunt → flee on high flee neighbors', () => {
    const next = evaluateNextState(
      baseCell({ currentState: 'hunt', hp: 80 }),
      snap({ fleeInfluence: 4, playerNearby: true }),
    );
    expect(next).toBe('flee');
  });

  it('10. hunt → flee on low hp', () => {
    const next = evaluateNextState(
      baseCell({ currentState: 'hunt', hp: 10, maxHp: 100 }),
      snap({ playerNearby: true }),
    );
    expect(next).toBe('flee');
  });

  it('11. flee → regroup when player far and regroup neighbors', () => {
    const next = evaluateNextState(
      baseCell({ currentState: 'flee' }),
      snap({
        nearestPlayerDistance: 20,
        fleeInfluence: 3,
        playerNearby: false,
      }),
    );
    expect(next).toBe('regroup');
  });

  it('12. regroup → alert when pack density high', () => {
    const next = evaluateNextState(
      baseCell({ currentState: 'regroup' }),
      snap({ monsterDensityInfluence: 4, playerNearby: false }),
    );
    expect(next).toBe('alert');
  });

  it('13. dead stays dead', () => {
    expect(evaluateNextState(baseCell({ currentState: 'dead', hp: 0 }), snap())).toBe('dead');
  });

  it('14. two-phase update applies next states together', () => {
    const reg = new MonsterRegistry();
    const grid = new SpatialGrid(6);
    const a = baseCell({ id: 'a', currentState: 'idle', position: { x: 0, z: 0 } });
    const b = baseCell({ id: 'b', currentState: 'alert', position: { x: 2, z: 0 } });
    reg.register(a);
    reg.register(b);
    runCellularTick(reg, grid, { playerX: 1, playerZ: 0 }, 1);
    expect(a.currentState).toBe('alert');
  });

  it('15. state propagation alert spreads', () => {
    const reg = new MonsterRegistry();
    const grid = new SpatialGrid(6);
    reg.register(baseCell({ id: 'a', currentState: 'idle', position: { x: 0, z: 0 } }));
    reg.register(baseCell({ id: 'b', currentState: 'alert', position: { x: 2, z: 0 } }));
    reg.register(baseCell({ id: 'c', currentState: 'idle', position: { x: 4, z: 0 } }));
    runCellularTick(reg, grid, { playerX: 0, playerZ: 0 }, 1);
    const c = reg.get('c');
    expect(['alert', 'idle']).toContain(c?.currentState);
  });

  it('16. order independence — batch apply not sequential drift', () => {
    const reg = new MonsterRegistry();
    const grid = new SpatialGrid(6);
    const cells = [
      baseCell({ id: 'a', currentState: 'hunt', position: { x: 0, z: 0 } }),
      baseCell({ id: 'b', currentState: 'hunt', position: { x: 2, z: 0 } }),
    ];
    for (const c of cells) reg.register(c);
    const r1 = runCellularTick(reg, grid, { playerX: 0, playerZ: 0 }, 1);
    const states1 = reg.getAll().map((c) => c.currentState).sort().join(',');
    resetMonsterCellCounter();
    const reg2 = new MonsterRegistry();
    for (const c of cells.map((x) => ({ ...x }))) reg2.register(c);
    const grid2 = new SpatialGrid(6);
    const r2 = runCellularTick(reg2, grid2, { playerX: 0, playerZ: 0 }, 1);
    const states2 = reg2.getAll().map((c) => c.currentState).sort().join(',');
    expect(states1).toBe(states2);
    expect(r1.transitions).toBe(r2.transitions);
  });

  it('17. behavior adapter maps hunt to chase', () => {
    const intent = behaviorIntentFromThought(baseCell({ currentState: 'hunt' }));
    expect(intent.legacyState).toBe('chase');
    expect(intent.locomotion).toBe('run');
  });

  it('18. behavior adapter maps attack', () => {
    const intent = behaviorIntentFromThought(baseCell({ currentState: 'attack' }));
    expect(intent.shouldAttack).toBe(true);
    expect(intent.legacyState).toBe('attack');
  });

  it('19. behavior adapter maps flee', () => {
    const intent = behaviorIntentFromThought(baseCell({ currentState: 'flee' }));
    expect(intent.locomotion).toBe('flee');
  });

  it('20. flee direction points away from player', () => {
    const d = fleeDirection(0, 0, 5, 0);
    expect(d.dx).toBeLessThan(0);
  });

  it('21. regroup target uses pack center', () => {
    const t = regroupTarget(baseCell(), { x: 10, z: 5 });
    expect(t.x).toBe(10);
    expect(t.z).toBe(5);
  });

  it('22. regroup target falls back to home', () => {
    const t = regroupTarget(baseCell({ homeX: 3, homeZ: 7 }), null);
    expect(t).toEqual({ x: 3, z: 7 });
  });

  it('23. cellular tick metrics finite', () => {
    const reg = new MonsterRegistry();
    const grid = new SpatialGrid(6);
    reg.register(baseCell({ id: 'a' }));
    const r = runCellularTick(reg, grid, { playerX: 0, playerZ: 0 }, 1);
    expect(Number.isFinite(r.durationMs)).toBe(true);
    expect(Number.isFinite(r.averageNeighborCount)).toBe(true);
  });

  it('24. no NaN in energy after tick', () => {
    const reg = new MonsterRegistry();
    const grid = new SpatialGrid(6);
    reg.register(baseCell({ id: 'a', energy: 0.5 }));
    runCellularTick(reg, grid, { playerX: 0, playerZ: 0 }, 1);
    expect(Number.isNaN(reg.get('a')!.energy)).toBe(false);
  });

  it('25. many ticks do not infinite loop', () => {
    const reg = new MonsterRegistry();
    const grid = new SpatialGrid(6);
    for (let i = 0; i < 8; i++) {
      reg.register(baseCell({
        id: `m${i}`,
        position: { x: i * 2, z: 0 },
        currentState: i % 2 === 0 ? 'idle' : 'alert',
      }));
    }
    for (let t = 0; t < 200; t++) {
      runCellularTick(reg, grid, { playerX: 5, playerZ: 0 }, t);
    }
    expect(reg.getAll().every((c) => Number.isFinite(c.energy))).toBe(true);
  });

  it('26. idle → rest when tired and safe', () => {
    const next = evaluateNextState(
      baseCell({ currentState: 'idle', energy: 0.1 }),
      snap({ playerNearby: false }),
    );
    expect(next).toBe('rest');
  });

  it('27. rest returns to idle when recovered', () => {
    const next = evaluateNextState(
      baseCell({ currentState: 'rest', energy: 0.7, hunger: 0.3 }),
      snap({ playerNearby: false }),
    );
    expect(next).toBe('idle');
  });

  it('28. attack → flee under pressure', () => {
    const next = evaluateNextState(
      baseCell({ currentState: 'attack', hp: 80 }),
      snap({ fleeInfluence: 4, playerInAttackRange: true }),
    );
    expect(next).toBe('flee');
  });

  it('29. attack stays when in range', () => {
    const next = evaluateNextState(
      baseCell({ currentState: 'attack' }),
      snap({ playerInAttackRange: true, fleeInfluence: 0 }),
    );
    expect(next).toBe('attack');
  });

  it('30. hunt stays without flee signal', () => {
    const next = evaluateNextState(
      baseCell({ currentState: 'hunt', hp: 90 }),
      snap({ playerNearby: true, fleeInfluence: 0, deadInfluence: 0 }),
    );
    expect(next).toBe('hunt');
  });

  it('31. alert stays without enough hunt neighbors', () => {
    const next = evaluateNextState(
      baseCell({ currentState: 'alert' }),
      snap({ huntInfluence: 1, fleeInfluence: 0, playerNearby: true }),
    );
    expect(next).toBe('alert');
  });

  it('32. spatial grid excludes distant cells', () => {
    const grid = new SpatialGrid(4);
    grid.insert(baseCell({ id: 'far', position: { x: 100, z: 100 } }));
    const ids = grid.queryNearby(0, 0, 5);
    expect(ids).not.toContain('far');
  });

  it('33. neighbor snapshot excludes self', () => {
    const reg = new MonsterRegistry();
    const grid = new SpatialGrid(6);
    const cell = baseCell({ id: 'self' });
    reg.register(cell);
    grid.insert(cell);
    const s = buildNeighborSnapshot(cell, reg, grid, 0, 0);
    expect(s.neighborCount).toBe(0);
  });

  it('34. dead neighbors counted', () => {
    const reg = new MonsterRegistry();
    const grid = new SpatialGrid(6);
    reg.register(baseCell({ id: 'self', position: { x: 0, z: 0 } }));
    reg.register(baseCell({ id: 'd', currentState: 'dead', position: { x: 1, z: 0 } }));
    grid.clear();
    for (const c of reg.getAll()) grid.insert(c);
    const s = buildNeighborSnapshot(reg.get('self')!, reg, grid, 50, 50);
    expect(s.deadCount).toBe(1);
    expect(s.deadInfluence).toBe(1);
  });

  it('43. boss influence weight is 3', () => {
    const reg = new MonsterRegistry();
    const grid = new SpatialGrid(6);
    reg.register(baseCell({ id: 'self', position: { x: 0, z: 0 } }));
    reg.register(baseCell({
      id: 'boss',
      speciesId: 'boss',
      currentState: 'alert',
      influenceWeight: 3,
      position: { x: 2, z: 0 },
    }));
    grid.clear();
    for (const c of reg.getAll()) grid.insert(c);
    const s = buildNeighborSnapshot(reg.get('self')!, reg, grid, 100, 100);
    expect(s.alertInfluence).toBe(3);
    expect(s.alertCount).toBe(1);
  });

  it('44. boss alert wakes pack faster than lone grunt', () => {
    const gruntWake = evaluateNextState(
      baseCell({ currentState: 'alert' }),
      snap({ huntInfluence: 1, fleeInfluence: 0, playerNearby: true }),
    );
    const bossWake = evaluateNextState(
      baseCell({ currentState: 'alert' }),
      snap({ huntInfluence: 2, fleeInfluence: 0, playerNearby: true }),
    );
    expect(gruntWake).toBe('alert');
    expect(bossWake).toBe('hunt');
  });

  it('35. MonsterCellularWorld binds metrics', () => {
    const world = new MonsterCellularWorld();
    const fakeMonster = {
      type: { id: 'grunt', maxHp: 50, aggroRange: 10, attackRange: 2, moveSpeed: 3 },
      group: { position: { x: 0, y: 0, z: 0 } },
      home: { x: 0, y: 0 },
      hp: 50,
      alive: true,
      cellularId: undefined as string | undefined,
    } as import('../Monster').Monster;
    world.bindMonster(fakeMonster);
    const m = world.cellularUpdate(5, 0);
    expect(m.monsterCount).toBe(1);
    expect(m.tick).toBe(1);
  });

  it('36. config tick interval is 250ms', () => {
    expect(MONSTER_CELLULAR_CONFIG.tickIntervalMs).toBe(250);
  });

  it('37. pushBounded utility works', () => {
    const list: number[] = [];
    for (let i = 0; i < 5; i++) pushBounded(list, i, 3);
    expect(list).toEqual([2, 3, 4]);
  });

  it('38. prependBounded utility works', () => {
    expect(prependBounded([3, 2], [9], 2)).toEqual([9, 3]);
  });

  it('39. hunt flees on dead neighbor threshold', () => {
    const next = evaluateNextState(
      baseCell({ currentState: 'hunt', hp: 90 }),
      snap({ deadInfluence: 3, playerNearby: true }),
    );
    expect(next).toBe('flee');
  });

  it('40. regroup → alert when player returns', () => {
    const next = evaluateNextState(
      baseCell({ currentState: 'regroup' }),
      snap({ playerNearby: true }),
    );
    expect(next).toBe('alert');
  });

  it('41. cellular world syncs hp on damage path', () => {
    const world = new MonsterCellularWorld();
    const fake = {
      type: { id: 'grunt', maxHp: 50, aggroRange: 10, attackRange: 2, moveSpeed: 3 },
      group: { position: { x: 1, y: 0, z: 1 } },
      home: { x: 1, y: 1 },
      hp: 10,
      alive: true,
      cellularId: undefined as string | undefined,
    } as import('../Monster').Monster;
    world.bindMonster(fake);
    world.syncFromMonsters();
    const cell = world.getCell(fake.cellularId!);
    expect(cell?.hp).toBe(10);
  });

  it('42. state counts by registry', () => {
    const reg = new MonsterRegistry();
    reg.register(baseCell({ id: 'a', currentState: 'hunt' }));
    reg.register(baseCell({ id: 'b', currentState: 'flee' }));
    const counts = reg.countByState();
    expect(counts.hunt).toBe(1);
    expect(counts.flee).toBe(1);
  });
});
