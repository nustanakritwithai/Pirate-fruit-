import { describe, expect, it } from 'vitest';
import { PirateMonsterAuthorityAdapter } from '../PirateMonsterAuthorityAdapter';

const actor = (overrides: Record<string, unknown> = {}) => ({
  actorId: 'monster:crab-1', kind: 'monster' as const, monsterType: 'crab', zone: 'pirate-fruit',
  generation: 1, spawnSequence: 1, stateSequence: 1, lifecycle: 'active' as const,
  pose: { x: 1, y: 0, z: 2, dir: 0 }, locomotion: 'idle' as const,
  animation: { combatState: 'idle', category: 'style', onGround: true, dashing: false, verticalVelocity: 0 },
  presentation: { events: [], projectiles: [] },
  ...overrides,
});

describe('PirateMonsterAuthorityAdapter', () => {
  it('queues bounded normalized intents without position, velocity, damage or target authority', () => {
    const adapter = new PirateMonsterAuthorityAdapter();
    for (let i = 0; i < 40; i++) {
      expect(adapter.queueIntent({ zone: 'pirate-fruit', kind: 'melee', category: 'sword', forwardX: 3, forwardZ: 4, range: 4 })).toBeTruthy();
    }
    const intents = adapter.drainIntents();
    expect(intents).toHaveLength(32);
    expect(intents[0]?.sequence).toBe(9);
    expect(intents[31]?.forwardX).toBe(0.6);
    expect(intents[31]).not.toHaveProperty('x');
    expect(intents[31]).not.toHaveProperty('velocity');
    expect(intents[31]).not.toHaveProperty('damage');
    expect(intents[31]).not.toHaveProperty('target');
  });

  it('clears old intents and advances lifecycle generation on zone/session change', () => {
    const adapter = new PirateMonsterAuthorityAdapter();
    const first = adapter.queueIntent({ zone: 'pirate-fruit', kind: 'skill', category: 'fruit', forwardX: 0, forwardZ: 1, range: 8, skillId: 'fireball' })!;
    adapter.setZone('starter-island');
    expect(adapter.drainIntents()).toEqual([]);
    const second = adapter.queueIntent({ zone: 'starter-island', kind: 'melee', category: 'style', forwardX: 1, forwardZ: 0, range: 2 })!;
    expect(second.intentId).not.toBe(first.intentId);
    adapter.resetSession();
    expect(adapter.drainIntents()).toEqual([]);
  });

  it('accepts central actor snapshots and rejects spoofed pose/zone/identity or oversized presentation', () => {
    const adapter = new PirateMonsterAuthorityAdapter();
    const valid = actor();
    const accepted = adapter.sanitizeActors('pirate-fruit', [valid]);
    expect(accepted).toHaveLength(1);
    expect(accepted[0]).not.toBe(valid);
    expect(accepted[0]?.pose).toEqual(valid.pose);
    expect(adapter.sanitizeActors('pirate-fruit', [valid], undefined, 'mist-jungle')[0]?.zone).toBe('mist-jungle');
    expect(adapter.sanitizeActors('mist-jungle', [valid], undefined, 'mist-jungle')).toEqual([]);
    expect(adapter.sanitizeActors('pirate-fruit', [actor({ pose: { x: Number.NaN, y: 0, z: 0, dir: 0 } })])).toEqual([]);
    expect(adapter.sanitizeActors('other-zone', [valid])).toEqual([]);
    expect(adapter.sanitizeActors('pirate-fruit', [actor({ actorId: 'player:spoof', monsterType: 'crab' })])).toEqual([]);
    expect(adapter.sanitizeActors('pirate-fruit', [actor({ presentation: { events: Array.from({ length: 33 }, () => ({})), projectiles: [] } })])).toEqual([]);
  });
});
