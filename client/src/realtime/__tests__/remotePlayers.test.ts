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
  it('spawns the canonical current player visual and interpolates toward the target', () => {
    const scene = new THREE.Scene();
    const players = new RemotePlayers(scene, 'starter-island', () => 1_000);
    players.applyPresence(snapshot({ x: 10, z: 20 }));
    expect(players.count).toBe(1);
    expect(scene.getObjectByName('remote-player:pirate-v1')).toBeTruthy();

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

  it('does not delete a visible player when a delayed old-island frame arrives', () => {
    const scene = new THREE.Scene();
    const players = new RemotePlayers(scene, 'starter-island', () => 1_000);
    players.applyPresence(snapshot({ islandId: 'starter-island' }));
    players.applyPresence(snapshot({ islandId: 'mist-jungle', x: 99 }));
    expect(players.count).toBe(1);
    expect(players.diagnostics).toMatchObject({
      receivedPresence: 2,
      acceptedPresence: 1,
      ignoredIslandPresence: 1,
      renderedPlayers: 1,
      lastPresence: { islandId: 'mist-jungle', accepted: false },
    });
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

  it('animates remote locomotion instead of sliding a rigid pose', () => {
    const scene = new THREE.Scene();
    const players = new RemotePlayers(scene, 'starter-island', () => 1_000);
    players.applyPresence(snapshot({ locomotion: 'run' }));
    const leg = scene.getObjectByName('player-rig:left-leg');
    expect(leg).toBeTruthy();
    const before = leg!.quaternion.clone();
    players.update(0.2);
    expect(leg!.quaternion.equals(before)).toBe(false);
  });

  it('applies remote attack, jump and dash animation snapshots', () => {
    const scene = new THREE.Scene();
    const players = new RemotePlayers(scene, 'starter-island', () => 1_000);
    const baseAnimation = {
      combatState: 'attack2' as const,
      category: 'sword' as const,
      onGround: true,
      dashing: false,
      verticalVelocity: 0,
      attackProgress: 0.55,
    };
    players.applyPresence(snapshot({ animation: baseAnimation }));
    const arm = scene.getObjectByName('player-rig:right-arm')!;
    const bindArm = arm.quaternion.clone();
    players.update(0.05);
    expect(arm.quaternion.equals(bindArm)).toBe(false);

    players.applyPresence(snapshot({ animation: {
      ...baseAnimation, combatState: 'idle', onGround: false, verticalVelocity: 7,
    } }));
    const leg = scene.getObjectByName('player-rig:left-leg')!;
    const attackLeg = leg.quaternion.clone();
    players.update(0.05);
    expect(leg.quaternion.equals(attackLeg)).toBe(false);

    players.applyPresence(snapshot({ animation: {
      ...baseAnimation, combatState: 'idle', dashing: true,
    } }));
    const chest = scene.getObjectByName('player-rig:chest')!;
    const jumpChest = chest.quaternion.clone();
    players.update(0.05);
    expect(chest.quaternion.equals(jumpChest)).toBe(false);
  });

  it('shows a visible presentation recoil for an authoritative combat hit', () => {
    const scene = new THREE.Scene();
    const players = new RemotePlayers(scene, 'starter-island', () => 1_000);
    players.applyPresence(snapshot({ x: 10, z: 20 }));
    const ghost = scene.getObjectByName('remote-player:pirate-v1') as THREE.Group;
    players.applyCombatHit('char-b', {
      directionX: 1,
      directionZ: 0,
      speed: 6,
      duration: 0.16,
    });
    players.update(0.016);
    expect(ghost.position.x).toBeGreaterThan(10.2);
    expect(ghost.position.z).toBeCloseTo(20, 1);
  });

  it('does not snap recoil back when an older presence frame arrives first', () => {
    const scene = new THREE.Scene();
    let now = 1_000;
    const players = new RemotePlayers(scene, 'starter-island', () => now);
    players.applyPresence(snapshot({ x: 10, z: 20 }));
    players.applyCombatHit('char-b', { directionX: 1, directionZ: 0, speed: 10, duration: 0.34 });
    players.applyPresence(snapshot({ x: 10, z: 20 })); // frame sent before knockback
    players.update(0.016);
    const ghost = scene.getObjectByName('remote-player:pirate-v1') as THREE.Group;
    expect(ghost.position.x).toBeGreaterThan(10.8);

    now += 120;
    players.applyPresence(snapshot({ x: 12.2, z: 20 })); // target caught up
    players.update(0.016);
    expect(ghost.position.x).toBeGreaterThan(10.4);
  });

  it('renders a boat proxy when onBoat and swaps back to the player visual on foot (S14)', () => {
    const scene = new THREE.Scene();
    const players = new RemotePlayers(scene, 'starter-island', () => 1_000);

    players.applyPresence(snapshot({ onBoat: true, boatId: 'war-galleon' }));
    expect(players.avatarKindFor('char-b')).toBe('boat:war-galleon');
    const meshCountBoat = countMeshes(scene);
    expect(meshCountBoat).toBeGreaterThan(0);

    // ลงจากเรือ → กลับเป็น ghost (avatar ถูกสร้างใหม่ที่ตำแหน่งเดิม)
    players.applyPresence(snapshot({ onBoat: false }));
    expect(players.avatarKindFor('char-b')).toBe('foot');
    expect(scene.getObjectByName('remote-player:pirate-v1')).toBeTruthy();
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

  it('uses distance LOD and hides remote avatars outside the mobile interest range', () => {
    const scene = new THREE.Scene();
    const focus = new THREE.Vector3();
    const players = new RemotePlayers(scene, 'starter-island', () => 1_000, {
      focus: () => focus,
      tier: 'low',
    });
    players.applyPresence(snapshot({ x: 5, z: 0 }));
    expect(players.lodFor('char-b')).toBe('full');

    players.applyPresence(snapshot({ x: 40, z: 0 }));
    players.update(0.016);
    expect(players.lodFor('char-b')).toBe('low');
    expect(scene.getObjectByName('remote-player-low:pirate-v1')).toBeTruthy();

    players.applyPresence(snapshot({ x: 90, z: 0 }));
    players.update(0.016);
    expect(players.lodFor('char-b')).toBe('hidden');
    const remoteRoot = scene.children.find((child) => child instanceof THREE.Group);
    expect(remoteRoot?.visible).toBe(false);
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
