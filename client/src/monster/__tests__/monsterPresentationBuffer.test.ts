import { describe, expect, it } from 'vitest';
import { MonsterPresentationBuffer } from '../MonsterManager';

describe('Pirate monster presentation buffer', () => {
  it('retains the newest 32 attack events with monotonic sequences', () => {
    const buffer = new MonsterPresentationBuffer();
    for (let i = 0; i < 33; i++) {
      buffer.recordEvent('monster:local-1', {
        kind: 'slash',
        position: { x: i, y: 1, z: 0 },
        heading: i,
        color: 0xff0000,
        scale: 1,
      }, 1_000 + i);
    }
    const events = buffer.snapshot('monster:local-1', 1_033).events;
    expect(events).toHaveLength(32);
    expect(events[0].position?.x).toBe(1);
    expect(events.map((event) => event.sequence)).toEqual(
      [...events].sort((a, b) => a.sequence - b.sequence).map((event) => event.sequence),
    );
  });

  it('ages events and expires them instead of clamping them alive', () => {
    const buffer = new MonsterPresentationBuffer();
    buffer.recordEvent('monster:local-1', { kind: 'hit-spark', position: { x: 0, y: 1, z: 0 }, color: 0xffffff }, 10_000);
    expect(buffer.snapshot('monster:local-1', 11_250).events[0].ageMs).toBe(1_250);
    expect(buffer.snapshot('monster:local-1', 13_001).events).toHaveLength(0);
  });

  it('keeps projectile position and remaining lifetime bounded for late join snapshots', () => {
    const buffer = new MonsterPresentationBuffer();
    buffer.recordProjectile('monster:local-1', {
      id: 'projectile:1',
      position: { x: 1, y: 1, z: 1 },
      direction: { x: 0, y: 0, z: 1 },
      velocity: { x: 0, y: 0, z: 24 },
      color: 0x66ccff,
      scale: 1,
      elapsed: 0,
      lifeFraction: 1,
      remainingMs: 2_000,
      skillId: 'skill-1',
    }, 20_000);
    const late = buffer.snapshot('monster:local-1', 20_750).projectiles[0];
    expect(late.remainingMs).toBe(1_250);
    expect(late.elapsed).toBeCloseTo(0.75);
    expect(buffer.snapshot('monster:local-1', 22_001).projectiles).toHaveLength(0);
  });

  it('clears all presentation state on actor despawn/session reset', () => {
    const buffer = new MonsterPresentationBuffer();
    buffer.recordEvent('monster:local-1', { kind: 'slash', position: { x: 0, y: 0, z: 0 }, heading: 0, color: 1, scale: 1 });
    buffer.recordProjectile('monster:local-1', {
      id: 'projectile:1', position: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 1 },
      velocity: { x: 0, y: 0, z: 1 }, color: 1, scale: 1, elapsed: 0, lifeFraction: 1, remainingMs: 1_000,
    });
    buffer.clearActor('monster:local-1');
    expect(buffer.snapshot('monster:local-1')).toEqual({ events: [], projectiles: [] });
    buffer.recordEvent('monster:local-2', { kind: 'slash', position: { x: 0, y: 0, z: 0 }, heading: 0, color: 1, scale: 1 });
    buffer.reset();
    expect(buffer.snapshot('monster:local-2')).toEqual({ events: [], projectiles: [] });
  });
});
