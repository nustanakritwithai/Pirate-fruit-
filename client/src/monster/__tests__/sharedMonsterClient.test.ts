import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorldMonsterAttack, WorldMonsterSnapshot } from '@pirate-fruit/shared';
import {
  SharedMonsterClient,
  resolveSharedMonsterPlayerDamage,
} from '../SharedMonsterClient';

const snapshot = (overrides: Partial<WorldMonsterSnapshot> = {}): WorldMonsterSnapshot => ({
  spawnId: 'starter-crab-1',
  monsterId: 'crab',
  islandId: 'starter-island',
  x: 22,
  z: -4,
  heading: 0,
  hp: 70,
  maxHp: 70,
  state: 'idle',
  ...overrides,
});

describe('S16 shared monster rendering and player defeat regression', () => {
  beforeEach(() => {
    const context = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      font: '',
      textBaseline: '',
      lineWidth: 1,
    };
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        width: 0,
        height: 0,
        getContext: () => context,
      })),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('reuses the normal monster visual and follows terrain height across deltas', () => {
    const scene = new THREE.Scene();
    const heightAt = (x: number, z: number) => 2 + x * 0.01 - z * 0.005;
    const client = new SharedMonsterClient(scene, 'starter-island', heightAt, () => 1_000);

    client.applySnapshot('starter-island', [snapshot()]);
    const rendered = scene.getObjectByName('monster:crab') as THREE.Group | undefined;
    expect(rendered).toBeDefined();
    expect(rendered!.children.length).toBeGreaterThan(1);
    expect(rendered!.position.y).toBeCloseTo(heightAt(22, -4));

    client.applyDelta('starter-island', [{
      spawnId: 'starter-crab-1', x: 30, z: 5, heading: 1, hp: 63, state: 'chase',
      hitReaction: { directionX: 1, directionZ: 0, strength: 0.64 },
    }]);
    client.update(1 / 60);
    const visualRoot = rendered!.children[0] as THREE.Group;
    expect(Math.hypot(visualRoot.position.x, visualRoot.position.z)).toBeGreaterThan(0.2);
    client.update(1);
    expect(rendered!.position.y).toBeCloseTo(heightAt(30, 5), 2);

    client.markDead('starter-crab-1');
    client.update(1);
    expect(rendered!.visible).toBe(false);
    client.applyRespawn(snapshot({ x: 24, z: -6 }));
    expect(rendered!.visible).toBe(true);
    client.dispose();
    expect(scene.getObjectByName('monster:crab')).toBeUndefined();
  });

  it('continues smooth presentation motion between authoritative movement deltas', () => {
    let now = 1_000;
    const scene = new THREE.Scene();
    const client = new SharedMonsterClient(scene, 'starter-island', () => 0, () => now);
    client.applySnapshot('starter-island', [snapshot({ x: 0, z: 0, state: 'chase' })]);
    const rendered = scene.getObjectByName('monster:crab') as THREE.Group;

    now += 200;
    client.applyDelta('starter-island', [{
      spawnId: 'starter-crab-1',
      x: 0.8,
      z: 0,
      heading: Math.PI / 2,
      hp: 70,
      state: 'chase',
    }]);
    for (let frame = 0; frame < 12; frame += 1) {
      now += 1_000 / 60;
      client.update(1 / 60);
    }

    // The visual keeps advancing instead of braking at x=0.8 while waiting
    // for the next 5 Hz Server delta.
    expect(rendered.position.x).toBeGreaterThan(0.8);

    client.applyDelta('starter-island', [{
      spawnId: 'starter-crab-1',
      x: 0.8,
      z: 0,
      heading: Math.PI / 2,
      hp: 70,
      state: 'idle',
    }]);
    now += 1_000;
    client.update(1);
    expect(rendered.position.x).toBeCloseTo(0.8, 2);
  });

  it('keeps an early boat-transition snapshot until the local island changes', () => {
    const scene = new THREE.Scene();
    const client = new SharedMonsterClient(scene, 'starter-island', () => 0, () => 1_000);
    const jungle = snapshot({
      spawnId: 'jungle-bandit-1',
      monsterId: 'jungle-bandit',
      islandId: 'mist-jungle',
      x: 170,
      z: -138,
      hp: 240,
      maxHp: 240,
    });

    client.applySnapshot('mist-jungle', [jungle]);
    expect(client.count).toBe(0);
    expect(client.setIsland('mist-jungle')).toBe(true);
    expect(client.count).toBe(1);
    expect(scene.getObjectByName('monster:jungle-bandit')).toBeDefined();
    expect(client.setIsland('mist-jungle')).toBe(false);
  });

  it('uploads the health bar texture only when authoritative HP changes', () => {
    let now = 1_000;
    const scene = new THREE.Scene();
    const client = new SharedMonsterClient(scene, 'starter-island', () => 0, () => now);
    client.applySnapshot('starter-island', [snapshot({ x: 0, z: 0, state: 'chase' })]);
    const rendered = scene.getObjectByName('monster:crab') as THREE.Group;
    const healthBar = rendered.children.find((child) => child instanceof THREE.Sprite) as THREE.Sprite;
    const texture = (healthBar.material as THREE.SpriteMaterial).map!;
    const initialVersion = texture.version;

    for (let tick = 1; tick <= 30; tick += 1) {
      now += 200;
      client.applyDelta('starter-island', [{
        spawnId: 'starter-crab-1',
        x: tick * 0.4,
        z: 0,
        heading: Math.PI / 2,
        hp: 70,
        state: 'chase',
      }]);
    }
    expect(texture.version).toBe(initialVersion);

    now += 200;
    client.applyDelta('starter-island', [{
      spawnId: 'starter-crab-1',
      x: 12.4,
      z: 0,
      heading: Math.PI / 2,
      hp: 64,
      state: 'stunned',
    }]);
    expect(texture.version).toBe(initialVersion + 1);

    now += 200;
    client.applyDelta('starter-island', [{
      spawnId: 'starter-crab-1',
      x: 12.4,
      z: 0,
      heading: Math.PI / 2,
      hp: 64,
      state: 'stunned',
    }]);
    expect(texture.version).toBe(initialVersion + 1);
  });

  it('reports a lethal shared-monster hit exactly when HP reaches zero', () => {
    expect(resolveSharedMonsterPlayerDamage(10, 12, (amount) => amount)).toEqual({
      hp: 0,
      taken: 12,
      defeated: true,
    });
    expect(resolveSharedMonsterPlayerDamage(10, 12, () => 4)).toEqual({
      hp: 6,
      taken: 4,
      defeated: false,
    });
    expect(resolveSharedMonsterPlayerDamage(0, 12, (amount) => amount)).toEqual({
      hp: 0,
      taken: 0,
      defeated: false,
    });
  });

  it('replays an authoritative shared-monster hit once for owner and remote observers, then resets on zone change', () => {
    const scene = new THREE.Scene();
    const spawnHitSpark = vi.fn();
    const client = new SharedMonsterClient(scene, 'starter-island', () => 0, () => 1_000, { spawnHitSpark });
    client.applySnapshot('starter-island', [snapshot({ x: 0, z: 0 })]);
    const delta = {
      spawnId: 'starter-crab-1', x: 0, z: 0, heading: 0, hp: 44, state: 'stunned' as const,
      damage: 26, hitReaction: { directionX: 0, directionZ: 1, strength: 0.82 },
    };

    client.applyDelta('starter-island', [delta]);
    client.applyDelta('starter-island', [delta]);
    expect(spawnHitSpark).toHaveBeenCalledTimes(1);
    expect(spawnHitSpark.mock.calls[0]?.[0]).toMatchObject({ x: 0, y: 0.65, z: 0 });

    expect(client.setIsland('mist-jungle')).toBe(true);
    client.applySnapshot('mist-jungle', [snapshot({ spawnId: 'jungle-bandit-1', monsterId: 'jungle-bandit', islandId: 'mist-jungle', x: 0, z: 0, hp: 214, maxHp: 240 })]);
    client.applyDelta('mist-jungle', [{ ...delta, spawnId: 'jungle-bandit-1', hp: 188, damage: 26 }]);
    expect(spawnHitSpark).toHaveBeenCalledTimes(2);

    client.resetSession();
    client.applyDelta('mist-jungle', [{ ...delta, spawnId: 'jungle-bandit-1', hp: 162, damage: 26 }]);
    expect(spawnHitSpark).toHaveBeenCalledTimes(3);
  });

  it('publishes and consumes presentation-only monster actors with sequence, despawn and zone guards', () => {
    const sourceScene = new THREE.Scene();
    const source = new SharedMonsterClient(sourceScene, 'starter-island', () => 0, () => 1_000);
    source.applySnapshot('starter-island', [snapshot({ x: 3, z: 4, state: 'chase' })]);
    const actors = source.getActors();
    expect(actors).toHaveLength(1);
    expect(actors[0]).toMatchObject({
      actorId: 'monster:starter-crab-1', kind: 'monster', monsterType: 'crab', zone: 'starter-island',
      lifecycle: 'active', locomotion: 'run', animation: { combatState: 'idle' },
    });
    expect(actors[0]).not.toHaveProperty('hp');
    expect(actors[0]).not.toHaveProperty('damage');

    const oversized = new SharedMonsterClient(new THREE.Scene(), 'starter-island', () => 0, () => 1_000);
    oversized.applyActors('starter-island', [{
      ...actors[0]!,
      presentation: {
        events: Array.from({ length: 33 }, (_, sequence) => ({ sequence, kind: 'hit-spark' as const, ageMs: 0, position: { x: 0, y: 0, z: 0 } })),
        projectiles: [],
      },
    }]);
    expect(oversized.count).toBe(0);

    const tooManyProjectiles = {
      ...actors[0]!,
      presentation: {
        events: [],
        projectiles: Array.from({ length: 33 }, (_, index) => ({
          id: `p-${index}`, position: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 1 },
          velocity: { x: 0, y: 0, z: 1 }, color: 0xffffff, scale: 1, elapsed: 0, lifeFraction: 1, remainingMs: 1000,
        })),
      },
    };
    oversized.applyActors('starter-island', [tooManyProjectiles]);
    expect(oversized.count).toBe(0);

    const remoteHits = vi.fn();
    const remoteScene = new THREE.Scene();
    const remote = new SharedMonsterClient(remoteScene, 'starter-island', () => 0, () => 1_000, { spawnHitSpark: remoteHits });
    remote.applyActors('starter-island', [{
      ...actors[0],
      presentation: { events: [{ sequence: 1, kind: 'hit-spark', ageMs: 0, position: { x: 3, y: 0.65, z: 4 }, color: 0xfff1a8 }], projectiles: [] },
    }], 'pirate-fruit:1:manifest:vectors');
    expect(remote.count).toBe(1);
    expect(remoteScene.children[0]?.name).toContain('central-monster:pirate-fruit:1:manifest:vectors:monster:starter-crab-1');
    expect(remoteHits).toHaveBeenCalledTimes(1);
    remote.applyActors('starter-island', [{ ...actors[0], stateSequence: actors[0].stateSequence }]);
    expect(remoteHits).toHaveBeenCalledTimes(1);

    remote.applyActors('starter-island', [{ ...actors[0], lifecycle: 'despawn', stateSequence: actors[0].stateSequence + 1 }]);
    expect(remote.count).toBe(0);
    remote.applyActors('other-island', actors);
    expect(remote.count).toBe(0);
    remote.resetSession(true);
    expect(remote.count).toBe(0);
  });

  it('derives bounded actor velocity and advances central motion between snapshots', () => {
    let now = 1_000;
    const scene = new THREE.Scene();
    const client = new SharedMonsterClient(scene, 'starter-island', () => 0, () => now);
    const actor = {
      actorId: 'monster:moving-1', kind: 'monster' as const, monsterType: 'crab', zone: 'starter-island',
      generation: 1, spawnSequence: 1, stateSequence: 1, lifecycle: 'active' as const,
      pose: { x: 0, y: 0, z: 0, dir: 0 }, locomotion: 'run' as const,
      animation: { combatState: 'chase', category: 'style', onGround: true, dashing: false, verticalVelocity: 0 },
      presentation: { events: [], projectiles: [] },
    };
    client.applyActors('starter-island', [actor]);
    now += 200;
    client.applyActors('starter-island', [{ ...actor, stateSequence: 2, pose: { ...actor.pose, x: 2 } }]);
    now += 100;
    client.update(1 / 60);
    const rendered = scene.children[0] as THREE.Group;
    expect(rendered.position.x).toBeGreaterThan(0.3);
    expect(rendered.position.x).toBeLessThan(2.8);
  });

  it('applies generation-scoped authoritative HP/result even when pose state is unchanged', () => {
    const hit = vi.fn();
    const damageNumber = vi.fn();
    const client = new SharedMonsterClient(new THREE.Scene(), 'starter-island', () => 0, () => 1_000, { spawnHitSpark: hit, spawnDamageNumber: damageNumber });
    const actor = {
      actorId: 'monster:authority-1', kind: 'monster' as const, monsterType: 'crab', zone: 'starter-island',
      generation: 4, spawnSequence: 2, stateSequence: 9, lifecycle: 'active' as const,
      pose: { x: 1, y: 0, z: 1, dir: 0 }, locomotion: 'idle' as const,
      animation: { combatState: 'attack1', category: 'style', onGround: true, dashing: false, verticalVelocity: 0 },
      authority: { authorityVersion: 'monster-authority/1' as const, serverTimeUtc: '2026-09-08T07:00:00.000Z', generation: 4,
        hp: { current: 100, max: 120, revision: 1 }, actionSequence: 1, resultRevision: 0, hit: false, damage: 0, death: false },
      presentation: { events: [], projectiles: [] },
    };
    client.applyActors('starter-island', [actor]);
    const state = (client as any).monsters.get('authority-1');
    expect(state.hp).toBe(100);
    client.applyActors('starter-island', [{ ...actor, authority: { ...actor.authority, hp: { current: 80, max: 120, revision: 2 }, hit: true, damage: 20, resultRevision: 1 } }]);
    expect(state.hp).toBe(80);
    expect(hit).toHaveBeenCalledTimes(1);
    expect(damageNumber).toHaveBeenCalledWith(expect.any(THREE.Vector3), 20);
    client.applyActors('starter-island', [{ ...actor, authority: { ...actor.authority, hp: { current: 40, max: 120, revision: 1 }, hit: true, damage: 60, resultRevision: 1 } }]);
    expect(state.hp).toBe(80);
    expect(hit).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed authority extension and does not invent HP for legacy actors', () => {
    const client = new SharedMonsterClient(new THREE.Scene(), 'starter-island');
    const actor = {
      actorId: 'monster:authority-2', kind: 'monster' as const, monsterType: 'crab', zone: 'starter-island',
      generation: 1, spawnSequence: 1, stateSequence: 1, lifecycle: 'active' as const,
      pose: { x: 0, y: 0, z: 0, dir: 0 }, locomotion: 'idle' as const,
      animation: { combatState: 'idle', category: 'style', onGround: true, dashing: false, verticalVelocity: 0 },
      presentation: { events: [], projectiles: [] },
    };
    client.applyActors('starter-island', [{ ...actor, authority: { authorityVersion: 'monster-authority/1', serverTimeUtc: 'bad', generation: actor.generation, actionSequence: 1, resultRevision: 0, hit: false, damage: 0, death: false, hp: { current: 10, max: 20, revision: 1 } } }]);
    expect(client.count).toBe(0);
    client.applyActors('starter-island', [actor]);
    const state = (client as any).monsters.get('authority-2');
    expect(state.hp).toBe(70);
  });

  it('retires stale monster generations and accepts a fresh generation', () => {
    const spawnHitSpark = vi.fn();
    const client = new SharedMonsterClient(new THREE.Scene(), 'starter-island', () => 0, () => 1_000, { spawnHitSpark });
    const actor = {
      actorId: 'monster:7', kind: 'monster' as const, monsterType: 'crab', zone: 'starter-island',
      generation: 1, spawnSequence: 7, stateSequence: 1, lifecycle: 'active' as const,
      pose: { x: 2, y: 1, z: 3, dir: 0 }, locomotion: 'idle' as const,
      animation: { combatState: 'attack', category: 'style', onGround: true, dashing: false, verticalVelocity: 0 },
      presentation: { projectiles: [], events: [{ sequence: 1, kind: 'hit-spark' as const, ageMs: 0, position: { x: 2, y: 1, z: 3 }, color: 0x74c8ff }] },
    };
    client.applyActors('starter-island', [actor]);
    expect(client.count).toBe(1);
    expect(spawnHitSpark).toHaveBeenCalledTimes(1);

    client.applyActors('starter-island', [{ ...actor, lifecycle: 'despawn', stateSequence: 2 }]);
    client.applyActors('starter-island', [actor]);
    expect(spawnHitSpark).toHaveBeenCalledTimes(1);
    client.applyActors('starter-island', [{ ...actor, generation: 2, stateSequence: 1, presentation: { ...actor.presentation! } }]);
    expect(spawnHitSpark).toHaveBeenCalledTimes(2);
  });

  it('publishes provider actors through the gameplay adapter without authority fields', () => {
    const client = new SharedMonsterClient(new THREE.Scene(), 'starter-island');
    client.setActorProvider((zone, generation) => [{
      actorId: 'monster:provider-1', kind: 'monster', monsterType: 'crab', zone, generation,
      spawnSequence: 1, stateSequence: 1, lifecycle: 'active', pose: { x: 0, y: 1, z: 0, dir: 0 },
      locomotion: 'idle', animation: { combatState: 'attack', category: 'style', onGround: true, dashing: false, verticalVelocity: 0 },
      presentation: { events: [], projectiles: [] },
    }]);
    const actors = client.getActors();
    expect(actors).toHaveLength(1);
    expect(actors[0]).toMatchObject({ actorId: 'monster:provider-1', kind: 'monster', monsterType: 'crab', generation: 1 });
    expect(actors[0]).not.toHaveProperty('hp');
    expect(actors[0]).not.toHaveProperty('damage');
  });

  it('cleans actor state across reconnect and island changes without replaying the old generation', () => {
    const hits = vi.fn();
    const client = new SharedMonsterClient(new THREE.Scene(), 'starter-island', () => 0, () => 1_000, { spawnHitSpark: hits });
    const actor = {
      actorId: 'monster:reconnect-1', kind: 'monster' as const, monsterType: 'crab', zone: 'starter-island',
      generation: 1, spawnSequence: 1, stateSequence: 1, lifecycle: 'active' as const,
      pose: { x: 1, y: 0, z: 1, dir: 0 }, locomotion: 'idle' as const,
      animation: { combatState: 'idle', category: 'style', onGround: true, dashing: false, verticalVelocity: 0 },
      presentation: { events: [{ sequence: 1, kind: 'hit-spark' as const, ageMs: 0, position: { x: 1, y: 0, z: 1 } }], projectiles: [] },
    };
    client.applyActors('starter-island', [actor]);
    expect(client.count).toBe(1);
    client.resetSession();
    client.applyActors('starter-island', [{ ...actor, generation: 2, stateSequence: 1 }]);
    expect(client.count).toBe(1);
    expect(hits).toHaveBeenCalledTimes(2);
    expect(client.setIsland('mist-jungle')).toBe(true);
    client.applyActors('starter-island', [actor]);
    expect(client.count).toBe(0);
  });

  it('suppresses stale attack damage and attack intents while shopping in a safe zone', () => {
    const scene = new THREE.Scene();
    const client = new SharedMonsterClient(scene, 'starter-island', () => 0, () => 1_000);
    client.applySnapshot('starter-island', [snapshot({ x: 1, z: 8, state: 'attack' })]);
    expect(client.collectPlayerDamage(new THREE.Vector3(0, 0, 8))).toBe(0);
    expect(client.targetsInCone(new THREE.Vector3(0, 0, 8), 1, 0, 24, Math.PI / 3)).toEqual([]);
  });

  it('deals damage only from a unique server attack action hit frame', () => {
    let now = 1_000;
    const scene = new THREE.Scene();
    const client = new SharedMonsterClient(scene, 'starter-island', () => 0, () => now);
    client.applySnapshot('starter-island', [snapshot({ x: 20, z: 8, state: 'attack' })]);
    const attack: WorldMonsterAttack = {
      attackId: 'starter-crab-1:1',
      spawnId: 'starter-crab-1',
      monsterId: 'crab',
      islandId: 'starter-island',
      targetId: 'player-1',
      action: 'melee',
      damage: 7,
      hitDelayMs: 180,
    };
    client.applyAttack(attack, 'player-1');
    client.applyAttack(attack, 'player-1');
    expect(client.collectPlayerDamage(new THREE.Vector3(20, 0, 8))).toBe(0);
    now += 180;
    expect(client.collectPlayerDamage(new THREE.Vector3(20, 0, 8))).toBe(7);
    expect(client.collectPlayerDamage(new THREE.Vector3(20, 0, 8))).toBe(0);
  });

  it('cancels a queued monster hit when the server confirms hit-stun', () => {
    let now = 1_000;
    const scene = new THREE.Scene();
    const client = new SharedMonsterClient(scene, 'starter-island', () => 0, () => now);
    client.applySnapshot('starter-island', [snapshot({ x: 20, z: 8, state: 'attack' })]);
    const attack: WorldMonsterAttack = {
      attackId: 'starter-crab-1:interrupt-me',
      spawnId: 'starter-crab-1',
      monsterId: 'crab',
      islandId: 'starter-island',
      targetId: 'player-1',
      action: 'melee',
      damage: 7,
      hitDelayMs: 180,
    };
    client.applyAttack(attack, 'player-1');
    client.applyDelta('starter-island', [{
      spawnId: 'starter-crab-1', x: 20, z: 8, heading: 0, hp: 58, state: 'stunned',
      cancelAttackId: attack.attackId,
    }]);

    now += 180;
    expect(client.collectPlayerDamage(new THREE.Vector3(20, 0, 8))).toBe(0);

    client.applyAttack({ ...attack, attackId: 'starter-crab-1:while-stunned' }, 'player-1');
    now += 180;
    expect(client.collectPlayerDamage(new THREE.Vector3(20, 0, 8))).toBe(0);
  });
});

