import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RemotePlayers } from '../RemotePlayers';
import type { RealtimePresenceSnapshot } from '../RealtimeClient';

function snapshot(overrides: Partial<RealtimePresenceSnapshot> = {}): RealtimePresenceSnapshot {
  return {
    playerId: 'char-b',
    name: 'Bob',
    islandId: 'starter-island',
    x: 10,
    y: 0,
    z: 20,
    heading: 0,
    onBoat: false,
    ...overrides,
  };
}

describe('S13 RemotePlayers', () => {
  it('spawns a ghost on first presence and interpolates toward the target', () => {
    const scene = new THREE.Scene();
    const players = new RemotePlayers(scene, 'starter-island', () => 1_000);
    players.applyPresence(snapshot({ x: 10, z: 20 }));
    expect(players.count).toBe(1);

    // เฟรมถัดมาเป้าเลื่อน — ตำแหน่งไถลเข้าหา (ไม่กระโดดทันที)
    players.applyPresence(snapshot({ x: 30, z: 20 }));
    players.update(0.1);
    const ghost = scene.children.find((child) => child instanceof THREE.Group) as THREE.Group;
    expect(ghost.position.x).toBeGreaterThan(10);
    expect(ghost.position.x).toBeLessThan(30);
  });

  it('removes a ghost on presence-leave', () => {
    const scene = new THREE.Scene();
    const players = new RemotePlayers(scene, 'starter-island', () => 1_000);
    players.applyPresence(snapshot());
    players.remove('char-b');
    expect(players.count).toBe(0);
    expect(scene.children.some((child) => child instanceof THREE.Group)).toBe(false);
  });

  it('ignores presence for a different island and clears ghosts when we change island', () => {
    const scene = new THREE.Scene();
    const players = new RemotePlayers(scene, 'starter-island', () => 1_000);
    players.applyPresence(snapshot({ islandId: 'mist-jungle' }));
    expect(players.count).toBe(0);

    players.applyPresence(snapshot({ islandId: 'starter-island' }));
    expect(players.count).toBe(1);
    players.setIsland('mist-jungle');
    expect(players.count).toBe(0);
  });

  it('reaps ghosts that go stale (no presence for too long)', () => {
    let clock = 1_000;
    const scene = new THREE.Scene();
    const players = new RemotePlayers(scene, 'starter-island', () => clock);
    players.applyPresence(snapshot());
    expect(players.count).toBe(1);
    clock += 21_000; // > STALE_MS
    players.update(0.016);
    expect(players.count).toBe(0);
  });
});
