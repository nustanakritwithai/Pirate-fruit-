import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Effects } from '../../effects/Effects';
import { ScopedVisualEffects } from '../ScopedVisualEffects';

describe('ScopedVisualEffects contract', () => {
  it('keeps bursts above 32 queued and acknowledges exactly one batch', () => {
    const scoped = new ScopedVisualEffects(new Effects(new THREE.Scene()));
    for (let i = 0; i < 40; i++) scoped.spawnSlash(new THREE.Vector3(i, 0, 0), i, 0x9fdcff, 1);
    const first = scoped.current();
    expect(first.events).toHaveLength(32);
    scoped.acknowledgeEvents(first.events.length);
    expect(scoped.current().events).toHaveLength(8);
  });

  it('captures an immutable projectile start and real remaining lifetime', () => {
    const scoped = new ScopedVisualEffects(new Effects(new THREE.Scene()));
    const visual = scoped.createEnergyProjectile(new THREE.Vector3(1, 2, 3), new THREE.Vector3(0, 0, 1), 0x123456, 1);
    const first = scoped.current();
    const start = first.events.find((event) => event.kind === 'projectile-start')!;
    const startPosition = (start.projectile as { position: { x: number } }).position.x;
    visual.root.position.x = 9;
    scoped.updateEnergyProjectile(visual, 0.5, 0.5);
    expect((start.projectile as { position: { x: number } }).position.x).toBe(startPosition);
    expect(scoped.current().projectiles[0].remainingMs).toBe(3000);
  });

  it('preserves summon lifetimes supplied by the call site', () => {
    const scoped = new ScopedVisualEffects(new Effects(new THREE.Scene()));
    scoped.createEnergyProjectile(new THREE.Vector3(), new THREE.Vector3(0, 0, 1), 0xffffff, 1, 9_000);
    expect(scoped.current().projectiles[0].remainingMs).toBe(9_000);
    scoped.createEnergyProjectile(new THREE.Vector3(), new THREE.Vector3(0, 0, 1), 0xffffff, 1, 6_500);
    expect(scoped.current().projectiles[1].remainingMs).toBe(6_500);
  });

  it('uses authoritative remaining time independently from the visual phase fraction', () => {
    const scoped = new ScopedVisualEffects(new Effects(new THREE.Scene()));
    const visual = scoped.createEnergyProjectile(new THREE.Vector3(), new THREE.Vector3(0, 0, 1), 0xffffff, 1, 9_000);
    scoped.updateEnergyProjectile(visual, 0.1, 1, { elapsed: 3, remainingMs: 6_000 });
    expect(scoped.current().projectiles[0].remainingMs).toBe(6_000);
    expect(scoped.current().projectiles[0].elapsed).toBe(3);
  });

  it('rounds fractional remaining milliseconds and expires old queued events', () => {
    const scoped = new ScopedVisualEffects(new Effects(new THREE.Scene()));
    const visual = scoped.createEnergyProjectile(new THREE.Vector3(), new THREE.Vector3(0, 0, 1));
    scoped.updateEnergyProjectile(visual, 0.1, 1, { remainingMs: 1234.56 });
    expect(Number.isInteger(scoped.current().projectiles[0].remainingMs)).toBe(true);
  });

  it('resets session and drops queued events/projectiles when island changes', () => {
    const scoped = new ScopedVisualEffects(new Effects(new THREE.Scene()));
    scoped.spawnHitSpark(new THREE.Vector3(1, 0, 0));
    const visual = scoped.createEnergyProjectile(new THREE.Vector3(), new THREE.Vector3(0, 0, 1));
    const previousSession = scoped.current().sessionId;
    scoped.resetSession();
    const next = scoped.current();
    expect(next.sessionId).not.toBe(previousSession);
    expect(next.events).toHaveLength(0);
    expect(next.projectiles).toHaveLength(0);
    expect(() => scoped.updateEnergyProjectile(visual, 0.1, 0.9)).not.toThrow();
    expect(scoped.current().projectiles).toHaveLength(0);
    scoped.destroyEnergyProjectile(visual);
    expect(scoped.current().events).toHaveLength(0);
  });
});
