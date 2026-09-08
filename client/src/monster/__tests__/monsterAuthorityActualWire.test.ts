import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PirateMonsterAuthorityAdapter } from '../PirateMonsterAuthorityAdapter';
import { SharedMonsterClient, type SharedMonsterActor } from '../SharedMonsterClient';

const fixtureText = (import.meta.glob('./fixtures/monster-authority-wire.actual.json', { query: '?raw', import: 'default', eager: true })
  ['./fixtures/monster-authority-wire.actual.json'] as string);
const wire = JSON.parse(fixtureText) as { payload: { actors: SharedMonsterActor[] } };

describe('actual Server monster authority wire through Pirate receiver', () => {
  beforeEach(() => {
    const context = { clearRect: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(), fillStyle: '', strokeStyle: '', font: '', textBaseline: '', lineWidth: 1 };
    vi.stubGlobal('document', { createElement: vi.fn(() => ({ width: 0, height: 0, getContext: () => context })) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('accepts actual capture actor, queues one targeted hit, and dedupes the repeated snapshot', () => {
    let now = 1_000;
    const sparks = vi.fn();
    const damageNumbers = vi.fn();
    const client = new SharedMonsterClient(
      new THREE.Scene(),
      'pirate-fruit',
      () => 0,
      () => now,
      { spawnHitSpark: sparks, spawnDamageNumber: damageNumbers },
      (targetId) => targetId === 'player-1' ? new THREE.Vector3(3, 0, 4) : undefined,
    );
    const adapter = new PirateMonsterAuthorityAdapter();
    const safe = adapter.sanitizeActors('pirate-fruit', wire.payload.actors, undefined, 'pirate-fruit');
    expect(safe).toHaveLength(1);
    const actor = safe[0]!;
    expect(actor.actorId).toBe('monster:east-forest');
    expect(actor.authority?.attack?.targetId).toBe('player-1');
    client.applyActors('pirate-fruit', safe, 'actual-wire', 'player-1');
    client.applyActors('pirate-fruit', safe, 'actual-wire', 'player-1');
    now = 1_200;
    client.update(0.2);
    expect(client.collectPlayerHits(new THREE.Vector3(18.904702116597015, 0, -2.39975008994979))).toEqual([{
      damage: 5,
      sourceX: expect.any(Number),
      sourceZ: expect.any(Number),
      attackId: 'monster:east-forest:player-1:1:monster-hit-1:1',
    }]);
    expect(client.collectPlayerHits(new THREE.Vector3(18.904702116597015, 0, -2.39975008994979))).toHaveLength(0);
    expect(sparks).toHaveBeenCalledTimes(1);
    expect(damageNumbers).not.toHaveBeenCalled();
  });
});

