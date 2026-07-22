import { describe, expect, it } from 'vitest';
import {
  SHARED_MONSTER_TYPES,
  WORLD_MONSTER_CONTRIBUTION_WINDOW_MS,
  WORLD_MONSTER_ATTACK_HIT_DELAY_MS,
  WORLD_MONSTER_MELEE_DAMAGE,
  type SharedSpawnPoint,
} from '@pirate-fruit/shared';
import { MonsterSimulation, type PlayerView } from './monsterSimulation.js';

const SPAWNS: SharedSpawnPoint[] = [
  { spawnId: 's-crab', islandId: 'starter-island', monsterId: 'crab', homeX: 0, homeZ: 0, patrolRadius: 4 },
  { spawnId: 's-grunt', islandId: 'mist-jungle', monsterId: 'grunt', homeX: 100, homeZ: 100, patrolRadius: 4 },
];

function player(characterId: string, islandId: string, x: number, z: number): PlayerView {
  return { characterId, islandId, x, z };
}

const NO_SAFE_ZONES = () => false;

describe('S16 MonsterSimulation', () => {
  it('spawns monsters at home, idle, full hp', () => {
    const sim = new MonsterSimulation(() => 0, SPAWNS, NO_SAFE_ZONES);
    const snapshot = sim.snapshotForIsland('starter-island');
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({
      spawnId: 's-crab', monsterId: 'crab', x: 0, z: 0, state: 'idle', hp: SHARED_MONSTER_TYPES.crab.maxHp,
    });
    // interest/snapshot กรองตามเกาะ
    expect(sim.snapshotForIsland('mist-jungle').map((m) => m.spawnId)).toEqual(['s-grunt']);
  });

  it('aggros a nearby player then chases and attacks', () => {
    let now = 1_000;
    const sim = new MonsterSimulation(() => now, SPAWNS, NO_SAFE_ZONES);
    // ผู้เล่นเข้ามาในระยะ aggro (12) แต่ไกลกว่า attack (2.2)
    const chasing = sim.tick(now, 200, [player('p1', 'starter-island', 8, 0)]);
    expect(sim.stateOf('s-crab')).toMatch(/aggro|chase/);
    expect([...chasing.dirtyByIsland.get('starter-island') ?? []].length).toBeGreaterThan(0);

    // เดินเข้าหาเรื่อย ๆ จนติดระยะแล้วตี
    let attacked = false;
    let firstAttack: ReturnType<MonsterSimulation['tick']>['attacks'][number] | undefined;
    for (let i = 0; i < 60 && !attacked; i += 1) {
      now += 200;
      const result = sim.tick(now, 200, [player('p1', 'starter-island', 0, 0)]);
      firstAttack = result.attacks.find((a) => a.spawnId === 's-crab' && a.targetId === 'p1') ?? firstAttack;
      if (firstAttack) attacked = true;
    }
    expect(attacked).toBe(true);
    expect(firstAttack).toMatchObject({
      action: 'melee',
      damage: SHARED_MONSTER_TYPES.crab.damage,
      hitDelayMs: WORLD_MONSTER_ATTACK_HIT_DELAY_MS,
    });
    expect(sim.stateOf('s-crab')).toBe('attack');
    const action = sim.tick(now + 200, 200, [player('p1', 'starter-island', 0, 0)]).attacks;
    expect(action).toHaveLength(0);
  });

  it('holds position for one recovery beat after an attack before chasing again', () => {
    let now = 1_000;
    const sim = new MonsterSimulation(() => now, SPAWNS, NO_SAFE_ZONES);
    const first = sim.tick(now, 200, [player('p1', 'starter-island', 0, 0)]);
    expect(first.attacks).toHaveLength(1);
    const atImpact = sim.snapshotForIsland('starter-island')[0];

    now += 200;
    sim.tick(now, 200, [player('p1', 'starter-island', 5, 0)]);
    const duringRecovery = sim.snapshotForIsland('starter-island')[0];
    expect(duringRecovery.x).toBeCloseTo(atImpact.x);
    expect(duringRecovery.z).toBeCloseTo(atImpact.z);

    now += 200;
    sim.tick(now, 200, [player('p1', 'starter-island', 5, 0)]);
    const afterRecovery = sim.snapshotForIsland('starter-island')[0];
    expect(afterRecovery.x).toBeGreaterThan(duringRecovery.x);
  });

  it('drops a target that disappears from the world and returns home', () => {
    let now = 1_000;
    const sim = new MonsterSimulation(() => now, SPAWNS, NO_SAFE_ZONES);
    sim.tick(now, 200, [player('p1', 'starter-island', 5, 0)]);
    expect(sim.stateOf('s-crab')).toMatch(/aggro|chase|attack/);
    // ผู้เล่นหายไปจาก world (ไม่อยู่ในรายการอีก) → เลิกไล่ กลับบ้าน
    now += 200;
    sim.tick(now, 200, []);
    expect(sim.stateOf('s-crab')).toMatch(/return|idle|patrol/);
  });

  it('applies server-side damage only within range and records contribution', () => {
    const now = 5_000;
    const sim = new MonsterSimulation(() => now, SPAWNS, NO_SAFE_ZONES);
    // นอกระยะ melee → ปัดตก ไม่มี contribution
    expect(sim.applyHit(now, 's-crab', 'p1', 20, 0, 'melee')).toBeNull();
    expect(sim.contributorsOf('s-crab', now)).toHaveLength(0);
    // ในระยะ → โดน + บันทึก contribution (ดาเมจจาก Server)
    const hit = sim.applyHit(now, 's-crab', 'p1', 1, 0, 'melee');
    expect(hit).toMatchObject({
      damage: WORLD_MONSTER_MELEE_DAMAGE,
      dead: false,
      delta: { hitReaction: { directionX: expect.closeTo(-1, 6), directionZ: expect.closeTo(0, 6) } },
    });
    expect(sim.hpOf('s-crab')).toBe(SHARED_MONSTER_TYPES.crab.maxHp - WORLD_MONSTER_MELEE_DAMAGE);
    expect(sim.contributorsOf('s-crab', now)).toEqual([{ characterId: 'p1', damage: WORLD_MONSTER_MELEE_DAMAGE }]);
    // contribution เก่าเกินหน้าต่าง → ไม่ถูกนับ
    expect(sim.contributorsOf('s-crab', now + WORLD_MONSTER_CONTRIBUTION_WINDOW_MS + 1)).toHaveLength(0);
  });

  it('kills a monster then respawns it full after the delay (shared death)', () => {
    let now = 0;
    const sim = new MonsterSimulation(() => now, SPAWNS, NO_SAFE_ZONES);
    const hits = Math.ceil(SHARED_MONSTER_TYPES.crab.maxHp / WORLD_MONSTER_MELEE_DAMAGE);
    let last = null as ReturnType<MonsterSimulation['applyHit']>;
    for (let i = 0; i < hits; i += 1) last = sim.applyHit(now, 's-crab', 'p1', 0, 0, 'melee') ?? last;
    expect(last?.dead).toBe(true);
    expect(sim.stateOf('s-crab')).toBe('dead');
    // ตายแล้วตีไม่เข้า
    expect(sim.applyHit(now, 's-crab', 'p2', 0, 0, 'melee')).toBeNull();
    // ยังไม่ถึงเวลาเกิดใหม่
    now += SHARED_MONSTER_TYPES.crab.respawnMs - 1;
    expect(sim.tick(now, 200, []).respawns).toHaveLength(0);
    // ครบเวลา → เกิดใหม่ HP เต็ม
    now += 2;
    const respawns = sim.tick(now, 200, []).respawns;
    expect(respawns.map((r) => r.spawnId)).toEqual(['s-crab']);
    expect(sim.hpOf('s-crab')).toBe(SHARED_MONSTER_TYPES.crab.maxHp);
    expect(sim.stateOf('s-crab')).toBe('idle');
  });

  it('recovers state after a server restart via serialize/restore', () => {
    let now = 0;
    const sim = new MonsterSimulation(() => now, SPAWNS, NO_SAFE_ZONES);
    sim.applyHit(now, 's-crab', 'p1', 0, 0, 'melee');
    const persisted = sim.serialize();
    // Server restart: instance ใหม่ โหลดสถานะที่ persist ไว้
    const recovered = new MonsterSimulation(() => now, SPAWNS, NO_SAFE_ZONES);
    recovered.restore(persisted);
    expect(recovered.hpOf('s-crab')).toBe(SHARED_MONSTER_TYPES.crab.maxHp - WORLD_MONSTER_MELEE_DAMAGE);
  });

  it('does not aggro players on a different island', () => {
    const now = 1_000;
    const sim = new MonsterSimulation(() => now, SPAWNS, NO_SAFE_ZONES);
    sim.tick(now, 200, [player('p1', 'mist-jungle', 0, 0)]); // อยู่คนละเกาะกับ s-crab
    expect(sim.stateOf('s-crab')).toMatch(/idle|patrol/);
  });

  it('handles many monsters per island within a tick (load)', () => {
    const many: SharedSpawnPoint[] = [];
    for (let i = 0; i < 200; i += 1) {
      many.push({ spawnId: `m-${i}`, islandId: 'starter-island', monsterId: 'grunt', homeX: i, homeZ: 0, patrolRadius: 4 });
    }
    const sim = new MonsterSimulation(() => 0, many, NO_SAFE_ZONES);
    const players = Array.from({ length: 20 }, (_, i) => player(`p${i}`, 'starter-island', i * 10, 0));
    const started = Date.now();
    for (let t = 0; t < 10; t += 1) sim.tick(t * 200, 200, players);
    expect(Date.now() - started).toBeLessThan(500);
    expect(sim.snapshotForIsland('starter-island')).toHaveLength(200);
  });

  it('never targets or damages a player shopping in the canonical starter safe zone', () => {
    const spawn: SharedSpawnPoint[] = [
      { spawnId: 'safe-crab', islandId: 'starter-island', monsterId: 'crab', homeX: 19, homeZ: 8, patrolRadius: 0 },
    ];
    const sim = new MonsterSimulation(() => 1_000, spawn);
    const result = sim.tick(1_000, 200, [player('shopper', 'starter-island', 17, 8)]);
    expect(result.attacks).toHaveLength(0);
    expect(sim.stateOf('safe-crab')).not.toMatch(/aggro|chase|attack/);
  });

  it('drops an active target as soon as the player enters a safe zone', () => {
    let now = 1_000;
    const spawn: SharedSpawnPoint[] = [
      { spawnId: 'edge-crab', islandId: 'starter-island', monsterId: 'crab', homeX: 23, homeZ: 8, patrolRadius: 0 },
    ];
    const sim = new MonsterSimulation(() => now, spawn);
    sim.tick(now, 200, [player('runner', 'starter-island', 20, 8)]);
    expect(sim.stateOf('edge-crab')).toMatch(/aggro|chase/);

    now += 200;
    const result = sim.tick(now, 200, [player('runner', 'starter-island', 17, 8)]);
    expect(result.attacks).toHaveLength(0);
    expect(sim.stateOf('edge-crab')).toBe('return');
    expect(sim.snapshotForIsland('starter-island')[0]!.x).toBeGreaterThan(18);
  });

  it('rejects monster hits launched from inside a safe zone', () => {
    const spawn: SharedSpawnPoint[] = [
      { spawnId: 'edge-crab', islandId: 'starter-island', monsterId: 'crab', homeX: 19, homeZ: 8, patrolRadius: 0 },
    ];
    const sim = new MonsterSimulation(() => 1_000, spawn);
    expect(sim.applyHit(1_000, 'edge-crab', 'camper', 17, 8, 'melee')).toBeNull();
    expect(sim.hpOf('edge-crab')).toBe(SHARED_MONSTER_TYPES.crab.maxHp);
  });
});
