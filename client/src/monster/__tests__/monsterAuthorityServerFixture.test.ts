import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PirateMonsterAuthorityAdapter } from '../PirateMonsterAuthorityAdapter';
import { SharedMonsterClient, type SharedMonsterActor } from '../SharedMonsterClient';

const fixtureText = (import.meta.glob('./fixtures/monster-authority-contract.json', { query: '?raw', import: 'default', eager: true })
  ['./fixtures/monster-authority-contract.json'] as string);
const fixture = JSON.parse(fixtureText) as {
  generation: number;
  stateSequence: number;
  cases: Array<{ name: string; actorId: string; hp: { current: number; max: number; revision: number }; resultRevision: number; attack: Record<string, unknown> | null }>;
};

function actorFromCase(index: number, overrides: Partial<SharedMonsterActor> = {}): SharedMonsterActor {
  const item = fixture.cases[index];
  const attack = item.attack ? {
    attackId: String(item.attack.attackId), spawnId: String(item.attack.spawnId), monsterId: String(item.attack.monsterId),
    islandId: String(item.attack.islandId), targetId: String(item.attack.targetId), action: String(item.attack.action),
    damage: Number(item.attack.damage), hitDelayMs: Number(item.attack.hitDelayMs),
  } : null;
  return {
    actorId: item.actorId,
    kind: 'monster',
    monsterType: 'crab',
    zone: 'pirate-fruit',
    generation: fixture.generation,
    spawnSequence: 1,
    stateSequence: fixture.stateSequence,
    lifecycle: 'active',
    pose: { x: 1, y: 0, z: 1, dir: 0 },
    locomotion: 'idle',
    animation: { combatState: 'idle', category: 'style', onGround: true, dashing: false, verticalVelocity: 0 },
    authority: {
      authorityVersion: 'monster-authority/1',
      serverTimeUtc: '2026-09-08T00:00:01Z',
      generation: fixture.generation,
      hp: item.hp,
      resultRevision: item.resultRevision,
      actionSequence: item.resultRevision,
      hit: index === 1,
      damage: index === 1 ? 0.5 : 0,
      death: false,
      attack,
    },
    presentation: {
      events: [{ sequence: 1, kind: 'hit-spark', ageMs: 0, position: { x: 1, y: 1, z: 1 }, color: 0xffffff }],
      projectiles: [],
    },
    ...overrides,
  };
}

describe('Server monster-authority fixture through Pirate sanitizers and apply path', () => {
  beforeEach(() => {
    const context = { clearRect: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(), fillStyle: '', strokeStyle: '', font: '', textBaseline: '', lineWidth: 1 };
    vi.stubGlobal('document', { createElement: vi.fn(() => ({ width: 0, height: 0, getContext: () => context })) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('applies monster-to-player attack once and replays an event at the same state sequence', () => {
    const sparks = vi.fn();
    const damageNumbers = vi.fn();
    let now = 1_000;
    const client = new SharedMonsterClient(new THREE.Scene(), 'pirate-fruit', () => 0, () => now, { spawnHitSpark: sparks, spawnDamageNumber: damageNumbers }, (targetId) => targetId === 'player:accepted-session' ? new THREE.Vector3(9, 0, 9) : undefined);
    const adapter = new PirateMonsterAuthorityAdapter();
    const actor = actorFromCase(0, { authority: { ...actorFromCase(0).authority!, hit: true, damage: 1 } });
    const safe = adapter.sanitizeActors('pirate-fruit', [actor], undefined, 'pirate-fruit');
    client.applyActors('pirate-fruit', safe, 'fixture', 'player:accepted-session');
    expect(client.collectPlayerHits(new THREE.Vector3())).toHaveLength(0);
    const hits = client.collectPlayerHits(new THREE.Vector3());
    expect(hits).toHaveLength(0);
    now = 1_200;
    client.update(0.2);
    expect(client.collectPlayerHits(new THREE.Vector3())).toEqual([{ damage: 1, sourceX: 1, sourceZ: 1, attackId: String(actor.authority?.attack?.attackId) }]);
    expect(sparks).toHaveBeenCalledWith(expect.objectContaining({ x: 9, y: 1, z: 9 }));
    expect(damageNumbers).not.toHaveBeenCalled();
    const sparkCount = sparks.mock.calls.length;
    client.applyActors('pirate-fruit', [{ ...actor, stateSequence: fixture.stateSequence, presentation: { ...actor.presentation!, events: [{ ...actor.presentation!.events[0], sequence: 2 }] } }], 'fixture', 'player:accepted-session');
    expect(sparks.mock.calls.length).toBeGreaterThan(sparkCount);
    expect(client.collectPlayerHits(new THREE.Vector3())).toHaveLength(0);
  });

  it('accepts fractional HP, rejects stale generation, and rejects flat legacy authority', () => {
    const damageNumbers = vi.fn();
    const client = new SharedMonsterClient(new THREE.Scene(), 'pirate-fruit', () => 0, () => Date.now(), { spawnHitSpark: vi.fn(), spawnDamageNumber: damageNumbers });
    const adapter = new PirateMonsterAuthorityAdapter();
    const actor = actorFromCase(1, { authority: { ...actorFromCase(1).authority!, hp: { current: 40.5, max: 41, revision: 1 } } });
    expect(adapter.sanitizeActors('pirate-fruit', [actor], undefined, 'pirate-fruit')).toHaveLength(1);
    client.applyActors('pirate-fruit', adapter.sanitizeActors('pirate-fruit', [actor], undefined, 'pirate-fruit'));
    expect((client as any).monsters.get('ember-slime:starter-harbor:1').hp).toBe(40.5);
    expect(damageNumbers).toHaveBeenCalledTimes(1);
    expect(adapter.sanitizeActors('pirate-fruit', [{ ...actor, generation: 6, authority: { ...actor.authority!, generation: 6 } }], undefined, 'pirate-fruit')).toHaveLength(1);
    client.applyActors('pirate-fruit', adapter.sanitizeActors('pirate-fruit', [{ ...actor, generation: 6, authority: { ...actor.authority!, generation: 6 } }], undefined, 'pirate-fruit'));
    expect((client as any).monsters.get('ember-slime:starter-harbor:1').hp).toBe(40.5);
    expect(adapter.sanitizeActors('pirate-fruit', [{ ...actor, authority: undefined, authorityVersion: 'monster-authority/1' }], undefined, 'pirate-fruit')).toEqual([]);
  });
});

