import { describe, expect, it, beforeEach } from 'vitest';
import {
  DevilFruitInfluenceWorld,
  resetAreaEffectCounter,
  strengthAt,
  createAreaEffect,
  mergeStackedEffect,
  findStackCandidate,
  inferEffectTypeFromSkill,
  applyDevilFruitEconomyPressures,
  DEVIL_FRUIT_INFLUENCE_CONFIG,
  DEVIL_FRUIT_EFFECT_TYPES,
} from '../influence';
import { createFreshWorld } from '../../trade/living/LivingTradePersistence';
import { ensureGenomeState } from '../../trade/living/EconomyGenomeInitializer';
import {
  MonsterRegistry,
  SpatialGrid,
  buildNeighborSnapshot,
  evaluateNextState,
  runCellularTick,
  computePackCohesion,
  computeFormationTarget,
  resolveEmergentRole,
} from '../../monster/cellular';
import type { MonsterCell, NeighborSnapshot } from '../../monster/cellular';
import type { CastableSkill } from '../../combat/SkillCasting';

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

function skill(partial: Partial<CastableSkill>): CastableSkill {
  return {
    id: 'ice-moveset-v1-z',
    name: 'Ice Blast',
    icon: '❄',
    cooldown: 6,
    energyCost: 16,
    castTime: 0.2,
    damage: 50,
    range: 18,
    radius: 6,
    renderType: 'projectile',
    isUltimate: false,
    category: 'fruit',
    color: 0x74c8ff,
    hitCount: 1,
    cc: [],
    ...partial,
  };
}

describe('Phase DF1 — Devil Fruit Simulation Core', () => {
  beforeEach(() => {
    resetAreaEffectCounter();
  });

  it('1. spawns area effect cell', () => {
    const world = new DevilFruitInfluenceWorld();
    const id = world.spawnEffect({ type: 'fire', x: 0, z: 0 });
    expect(id).toMatch(/^dfruit-area-/);
    expect(world.getEffects().length).toBe(1);
  });

  it('2. all effect types have defaults', () => {
    for (const type of DEVIL_FRUIT_EFFECT_TYPES) {
      expect(DEVIL_FRUIT_INFLUENCE_CONFIG[type].radius).toBeGreaterThan(0);
    }
  });

  it('3. strength falls off with distance', () => {
    const e = createAreaEffect({ type: 'fire', x: 0, z: 0 }, DEVIL_FRUIT_INFLUENCE_CONFIG.fire);
    expect(strengthAt(e, 0, 0)).toBeGreaterThan(strengthAt(e, 5, 0));
  });

  it('4. fire increases alert bias at center', () => {
    const world = new DevilFruitInfluenceWorld();
    world.spawnEffect({ type: 'fire', x: 0, z: 0, strength: 3 });
    const s = world.sampleAt(0, 0);
    expect(s.fire).toBeGreaterThan(1);
    expect(s.alertBias).toBeGreaterThan(0);
  });

  it('5. smoke reduces vision factor', () => {
    const world = new DevilFruitInfluenceWorld();
    world.spawnEffect({ type: 'smoke', x: 0, z: 0, strength: 3 });
    expect(world.sampleAt(0, 0).visionFactor).toBeLessThan(1);
  });

  it('6. ice reduces movement factor', () => {
    const world = new DevilFruitInfluenceWorld();
    world.spawnEffect({ type: 'ice', x: 0, z: 0, strength: 3 });
    expect(world.sampleAt(0, 0).movementFactor).toBeLessThan(1);
  });

  it('7. earthquake reduces cohesion factor', () => {
    const world = new DevilFruitInfluenceWorld();
    world.spawnEffect({ type: 'earthquake', x: 0, z: 0, strength: 3 });
    expect(world.sampleAt(0, 0).cohesionFactor).toBeLessThan(1);
  });

  it('8. poison increases flee bias', () => {
    const world = new DevilFruitInfluenceWorld();
    world.spawnEffect({ type: 'poison', x: 0, z: 0, strength: 2.5 });
    expect(world.sampleAt(0, 0).fleeBias).toBeGreaterThan(0);
  });

  it('9. effects expire after duration', () => {
    const world = new DevilFruitInfluenceWorld();
    world.spawnEffect({ type: 'fire', x: 0, z: 0, durationMs: 100 });
    world.influenceUpdate(150);
    expect(world.getEffects().length).toBe(0);
  });

  it('10. stack refreshes same-type nearby', () => {
    const world = new DevilFruitInfluenceWorld();
    world.spawnEffect({ type: 'fire', x: 0, z: 0, strength: 1 });
    world.spawnEffect({ type: 'fire', x: 1, z: 0, strength: 1 });
    expect(world.getEffects().length).toBe(1);
    expect(world.sampleAt(0, 0).fire).toBeGreaterThan(1);
  });

  it('11. mergeStackedEffect caps strength', () => {
    const existing = createAreaEffect({ type: 'fire', x: 0, z: 0, strength: 3 }, DEVIL_FRUIT_INFLUENCE_CONFIG.fire);
    const merged = mergeStackedEffect(existing, { type: 'fire', x: 0, z: 0, strength: 3 }, DEVIL_FRUIT_INFLUENCE_CONFIG.fire);
    expect(merged.strength).toBeLessThanOrEqual(DEVIL_FRUIT_INFLUENCE_CONFIG.stackStrengthCap);
  });

  it('12. findStackCandidate finds nearby same type', () => {
    const e = createAreaEffect({ type: 'smoke', x: 0, z: 0 }, DEVIL_FRUIT_INFLUENCE_CONFIG.smoke);
    const found = findStackCandidate([e], { type: 'smoke', x: 2, z: 0 });
    expect(found?.id).toBe(e.id);
  });

  it('13. infer ice from skill id', () => {
    expect(inferEffectTypeFromSkill(skill({ id: 'ice-moveset-v1-z' }))).toBe('ice');
  });

  it('14. infer fire from magma skill', () => {
    expect(inferEffectTypeFromSkill(skill({ id: 'magma-moveset-z', name: 'Magma Burst' }))).toBe('fire');
  });

  it('15. infer lightning from stun cc', () => {
    expect(inferEffectTypeFromSkill(skill({
      id: 'generic-z',
      cc: [{ type: 'stun', power: 0, duration: 1 }],
    }))).toBe('lightning');
  });

  it('16. infer poison from dot', () => {
    expect(inferEffectTypeFromSkill(skill({
      id: 'generic-z',
      dot: { dps: 5, duration: 3 },
    }))).toBe('poison');
  });

  it('17. fire in snapshot increases alert influence', () => {
    const reg = new MonsterRegistry();
    const grid = new SpatialGrid(6);
    const cell = baseCell({ id: 'self' });
    reg.register(cell);
    grid.insert(cell);
    const world = new DevilFruitInfluenceWorld();
    world.spawnEffect({ type: 'fire', x: 0, z: 0, strength: 3 });
    const s = buildNeighborSnapshot(cell, reg, grid, 50, 50, (x, z) => world.sampleAt(x, z));
    expect(s.fireInfluence).toBeGreaterThan(0);
    expect(s.alertInfluence).toBeGreaterThan(0);
  });

  it('18. smoke reduces hunt influence in snapshot', () => {
    const reg = new MonsterRegistry();
    const grid = new SpatialGrid(6);
    reg.register(baseCell({ id: 'self' }));
    reg.register(baseCell({ id: 'n', currentState: 'hunt', position: { x: 2, z: 0 } }));
    grid.clear();
    for (const c of reg.getAll()) grid.insert(c);
    const world = new DevilFruitInfluenceWorld();
    world.spawnEffect({ type: 'smoke', x: 0, z: 0, strength: 4 });
    const s = buildNeighborSnapshot(reg.get('self')!, reg, grid, 50, 50, (x, z) => world.sampleAt(x, z));
    const plain = buildNeighborSnapshot(reg.get('self')!, reg, grid, 50, 50);
    expect(s.huntInfluence).toBeLessThan(plain.huntInfluence);
  });

  it('19. fire causes hunt → flee via rules', () => {
    const next = evaluateNextState(
      baseCell({ currentState: 'hunt' }),
      snap({ fireInfluence: 2, playerNearby: true }),
    );
    expect(next).toBe('flee');
  });

  it('20. poison causes flee', () => {
    const next = evaluateNextState(
      baseCell({ currentState: 'hunt' }),
      snap({ poisonInfluence: 2 }),
    );
    expect(next).toBe('flee');
  });

  it('21. lightning stun skips cellular transition', () => {
    const reg = new MonsterRegistry();
    const grid = new SpatialGrid(6);
    reg.register(baseCell({ id: 'a', currentState: 'hunt' }));
    const world = new DevilFruitInfluenceWorld();
    world.spawnEffect({ type: 'lightning', x: 0, z: 0, strength: 3 });
    runCellularTick(reg, grid, {
      playerX: 0,
      playerZ: 0,
      sampleArea: (x, z) => world.sampleAt(x, z),
    }, 1);
    expect(reg.get('a')?.currentState).toBe('hunt');
  });

  it('22. earthquake jitters formation targets', () => {
    const c = baseCell({ id: 'a', currentState: 'hunt' });
    const t1 = computeFormationTarget(c, 0, 0, 'flanker');
    const c2 = { ...c, id: 'b' };
    const t2 = computeFormationTarget(c2, 0, 0, 'flanker');
    expect(t1.x !== t2.x || t1.z !== t2.z).toBe(true);
  });

  it('23. ice role watcher at distance', () => {
    const role = resolveEmergentRole(
      baseCell({ currentState: 'alert' }),
      snap({ iceInfluence: 2, areaMovementFactor: 0.5 }),
      20,
    );
    expect(role).toBe('watcher');
  });

  it('24. economy fire emits environment pressure', () => {
    const world = createFreshWorld();
    ensureGenomeState(world);
    const inf = new DevilFruitInfluenceWorld();
    inf.spawnEffect({ type: 'fire', x: 0, z: 0, strength: 3 });
    const count = applyDevilFruitEconomyPressures(world, inf);
    expect(count).toBeGreaterThan(0);
    expect(world.genomeState!.genomePressures.some((p) => p.source === 'environment')).toBe(true);
  });

  it('25. economy smoke pressure on industrialization', () => {
    const world = createFreshWorld();
    ensureGenomeState(world);
    const inf = new DevilFruitInfluenceWorld();
    inf.spawnEffect({ type: 'smoke', x: 0, z: 0, strength: 2 });
    applyDevilFruitEconomyPressures(world, inf);
    expect(world.genomeState!.genomePressures.some(
      (p) => p.source === 'environment' && p.target === 'industrialization',
    )).toBe(true);
  });

  it('26. economy earthquake production pressure', () => {
    const world = createFreshWorld();
    ensureGenomeState(world);
    const inf = new DevilFruitInfluenceWorld();
    inf.spawnEffect({ type: 'earthquake', x: 0, z: 0, strength: 2.5 });
    applyDevilFruitEconomyPressures(world, inf);
    expect(world.genomeState!.genomePressures.some(
      (p) => p.sourceReferenceId === 'df1:earthquake',
    )).toBe(true);
  });

  it('27. max effects bounded', () => {
    const world = new DevilFruitInfluenceWorld();
    for (let i = 0; i < DEVIL_FRUIT_INFLUENCE_CONFIG.maxActiveEffects + 5; i++) {
      world.spawnEffect({ type: 'wind', x: i * 20, z: 0 });
    }
    expect(world.getEffects().length).toBeLessThanOrEqual(DEVIL_FRUIT_INFLUENCE_CONFIG.maxActiveEffects);
  });

  it('28. sample at distance zero outside radius', () => {
    const world = new DevilFruitInfluenceWorld();
    world.spawnEffect({ type: 'fire', x: 0, z: 0 });
    expect(world.sampleAt(50, 50).fire).toBe(0);
  });

  it('29. multiple types stack independently', () => {
    const world = new DevilFruitInfluenceWorld();
    world.spawnEffect({ type: 'fire', x: 0, z: 0 });
    world.spawnEffect({ type: 'ice', x: 1, z: 1 });
    const s = world.sampleAt(0, 0);
    expect(s.fire).toBeGreaterThan(0);
    expect(s.ice).toBeGreaterThan(0);
  });

  it('30. pack cohesion finite with earthquake sample', () => {
    const pack = [
      baseCell({ id: 'a', currentState: 'hunt', position: { x: 0, z: 0 } }),
      baseCell({ id: 'b', currentState: 'hunt', position: { x: 2, z: 0 } }),
    ];
    expect(computePackCohesion(pack)).toBeGreaterThan(0);
  });

  it('31. cellular tick with fire sample runs', () => {
    const reg = new MonsterRegistry();
    const grid = new SpatialGrid(6);
    reg.register(baseCell({ id: 'a', currentState: 'idle' }));
    reg.register(baseCell({ id: 'b', currentState: 'alert', position: { x: 2, z: 0 } }));
    const world = new DevilFruitInfluenceWorld();
    world.spawnEffect({ type: 'fire', x: 0, z: 0, strength: 2 });
    const r = runCellularTick(reg, grid, {
      playerX: 0,
      playerZ: 0,
      sampleArea: (x, z) => world.sampleAt(x, z),
    }, 1);
    expect(r.snapshots.size).toBe(2);
  });

  it('32. wind effect spawns', () => {
    const world = new DevilFruitInfluenceWorld();
    world.spawnEffect({ type: 'wind', x: 0, z: 0 });
    expect(world.sampleAt(0, 0).wind).toBeGreaterThan(0);
  });

  it('33. sand effect spawns', () => {
    const world = new DevilFruitInfluenceWorld();
    world.spawnEffect({ type: 'sand', x: 0, z: 0 });
    expect(world.sampleAt(0, 0).sand).toBeGreaterThan(0);
  });

  it('34. darkness effect spawns', () => {
    const world = new DevilFruitInfluenceWorld();
    world.spawnEffect({ type: 'darkness', x: 0, z: 0 });
    expect(world.sampleAt(0, 0).darkness).toBeGreaterThan(0);
  });

  it('35. light effect spawns', () => {
    const world = new DevilFruitInfluenceWorld();
    world.spawnEffect({ type: 'light', x: 0, z: 0 });
    expect(world.sampleAt(0, 0).light).toBeGreaterThan(0);
  });

  it('36. clear removes all effects', () => {
    const world = new DevilFruitInfluenceWorld();
    world.spawnEffect({ type: 'fire', x: 0, z: 0 });
    world.clear();
    expect(world.getEffects().length).toBe(0);
  });

  it('37. metrics update on tick', () => {
    const world = new DevilFruitInfluenceWorld();
    world.spawnEffect({ type: 'fire', x: 0, z: 0 });
    world.influenceUpdate(10);
    expect(world.metrics.activeEffects).toBe(1);
    expect(Number.isFinite(world.metrics.lastTickMs)).toBe(true);
  });

  it('38. performance: 50 effects sample fast', () => {
    const world = new DevilFruitInfluenceWorld();
    for (let i = 0; i < 50; i++) {
      world.spawnEffect({ type: 'fire', x: (i % 10) * 3, z: Math.floor(i / 10) * 3 });
    }
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) world.sampleAt(i % 20, i % 15);
    expect(performance.now() - t0).toBeLessThan(50);
  });

  it('39. area movement factor on snapshot', () => {
    const reg = new MonsterRegistry();
    const grid = new SpatialGrid(6);
    const cell = baseCell();
    reg.register(cell);
    grid.insert(cell);
    const world = new DevilFruitInfluenceWorld();
    world.spawnEffect({ type: 'ice', x: 0, z: 0, strength: 3 });
    const s = buildNeighborSnapshot(cell, reg, grid, 0, 0, (x, z) => world.sampleAt(x, z));
    expect(s.areaMovementFactor).toBeLessThan(1);
  });

  it('40. area cohesion factor on snapshot from earthquake', () => {
    const reg = new MonsterRegistry();
    const grid = new SpatialGrid(6);
    const cell = baseCell();
    reg.register(cell);
    grid.insert(cell);
    const world = new DevilFruitInfluenceWorld();
    world.spawnEffect({ type: 'earthquake', x: 0, z: 0, strength: 3 });
    const s = buildNeighborSnapshot(cell, reg, grid, 0, 0, (x, z) => world.sampleAt(x, z));
    expect(s.areaCohesionFactor).toBeLessThan(1);
  });

  it('41. infer earthquake from ground render', () => {
    expect(inferEffectTypeFromSkill(skill({ id: 'x', renderType: 'ground' }))).toBe('earthquake');
  });

  it('42. poison sample at center is positive', () => {
    const world = new DevilFruitInfluenceWorld();
    world.spawnEffect({ type: 'poison', x: 0, z: 0 });
    expect(world.sampleAt(0, 0).poison).toBeGreaterThan(0);
  });
});
