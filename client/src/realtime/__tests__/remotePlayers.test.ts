import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RemotePlayers } from '../RemotePlayers';
import type { RealtimePresenceSnapshot } from '../RealtimeClient';

function countMeshes(scene: THREE.Scene): number {
  let n = 0;
  scene.traverse((o) => { if (o instanceof THREE.Mesh) n += 1; });
  return n;
}

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

  it('renders a boat proxy when onBoat and swaps back to a ghost on foot (S14)', () => {
    const scene = new THREE.Scene();
    const players = new RemotePlayers(scene, 'starter-island', () => 1_000);

    players.applyPresence(snapshot({ onBoat: true, boatId: 'war-galleon' }));
    expect(players.avatarKindFor('char-b')).toBe('boat:war-galleon');
    const meshCountBoat = countMeshes(scene);
    expect(meshCountBoat).toBeGreaterThan(0);

    // ลงจากเรือ → กลับเป็น ghost (avatar ถูกสร้างใหม่ที่ตำแหน่งเดิม)
    players.applyPresence(snapshot({ onBoat: false }));
    expect(players.avatarKindFor('char-b')).toBe('foot');
    expect(players.count).toBe(1);

    // เปลี่ยนรุ่นเรือ → avatar ใหม่ตามรุ่น
    players.applyPresence(snapshot({ onBoat: true, boatId: 'swift-sloop' }));
    expect(players.avatarKindFor('char-b')).toBe('boat:swift-sloop');
  });

  it('falls back to a default boat when the boat id is unknown', () => {
    const scene = new THREE.Scene();
    const players = new RemotePlayers(scene, 'starter-island', () => 1_000);
    players.applyPresence(snapshot({ onBoat: true, boatId: 'not-a-real-boat' }));
    expect(players.avatarKindFor('char-b')).toBe('boat:not-a-real-boat');
    expect(players.count).toBe(1);
  });

  it('finds only players inside the forward attack cone and in range (S15)', () => {
    const scene = new THREE.Scene();
    const players = new RemotePlayers(scene, 'starter-island', () => 1_000);
    players.applyPresence(snapshot({ playerId: 'front', x: 0, z: 3 }));   // ตรงหน้า ใกล้
    players.applyPresence(snapshot({ playerId: 'behind', x: 0, z: -3 }));  // ข้างหลัง
    players.applyPresence(snapshot({ playerId: 'far', x: 0, z: 40 }));     // หน้า แต่ไกล
    const origin = new THREE.Vector3(0, 0, 0);
    // forward = +Z, กรวย 90° (half=PI/4), ระยะ 5
    const hits = players.targetsInCone(origin, 0, 1, 5, Math.PI / 4);
    expect(hits).toEqual(['front']);
  });

  it('targets from latest server-relayed presence instead of the lagging render interpolation', () => {
    const scene = new THREE.Scene();
    const players = new RemotePlayers(scene, 'starter-island', () => 1_000);
    players.applyPresence(snapshot({ playerId: 'runner', x: 0, z: 3 }));
    players.applyPresence(snapshot({ playerId: 'runner', x: 0, z: 12 }));
    // The ghost is still visually near z=3, but the server already knows z=12.
    expect(players.targetsInCone(new THREE.Vector3(), 0, 1, 5, Math.PI / 2)).toEqual([]);
  });

  it('selects one nearest in-range target for touch auto-target fallback', () => {
    const scene = new THREE.Scene();
    const players = new RemotePlayers(scene, 'starter-island', () => 1_000);
    players.applyPresence(snapshot({ playerId: 'behind-near', x: 0, z: -2 }));
    players.applyPresence(snapshot({ playerId: 'front-far', x: 0, z: 4 }));
    expect(players.nearestTargetInRange(new THREE.Vector3(), 5)).toBe('behind-near');
  });

  it('hides a defeated player and shows them again on respawn (S15)', () => {
    const scene = new THREE.Scene();
    const players = new RemotePlayers(scene, 'starter-island', () => 1_000);
    players.applyPresence(snapshot({ playerId: 'foe', x: 1, z: 1 }));
    players.markDefeated('foe');
    // ถูกซ่อน → ไม่ถูกเลือกเป็นเป้าอีก
    expect(players.targetsInCone(new THREE.Vector3(0, 0, 0), 0, 1, 20, Math.PI)).not.toContain('foe');
    players.markRespawn('foe');
    expect(players.targetsInCone(new THREE.Vector3(0, 0, 0), 0, 1, 20, Math.PI)).toContain('foe');
  });

});
