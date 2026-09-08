import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RemotePlayers } from '../RemotePlayers';
import type { RealtimePresenceSnapshot } from '../RealtimeClient';

function countMeshes(scene: THREE.Object3D): number {
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

  it('applies authoritative observer HP/death and result effects without local damage', () => {
    const scene = new THREE.Scene();
    const players = new RemotePlayers(scene, 'starter-island', () => 1_000);
    players.applyPresence(snapshot());
    players.applyAuthoritativeHp('char-b', 40, 120, 'alive');
    players.applyAuthoritativeResult('char-b', 40);
    players.applyAuthoritativeHp('char-b', 0, 120, 'dead');
    const remote = scene.getObjectByName('remote-player:pirate-v1') as THREE.Group;
    expect(remote.visible).toBe(false);
    players.applyAuthoritativeHp('char-b', 80, 120, 'alive');
    expect(remote.visible).toBe(true);
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

  it('advances render-only action progress across duplicate 4Hz samples without changing target', () => {
    const scene = new THREE.Scene();
    const players = new RemotePlayers(scene, 'starter-island', () => 1_000);
    const action = {
      combatState: 'attack1' as const,
      category: 'sword' as const,
      onGround: true,
      dashing: false,
      verticalVelocity: 0,
      attackProgress: 0.2,
      actionSessionId: 'peer_progress',
      actionSequence: 1,
      actionDurationMs: 1_000,
    };
    players.applyPresence(snapshot({ x: 10, z: 20, animation: action }));
    players.update(0.1);
    const arm = scene.getObjectByName('player-rig:right-arm')!;
    const first = arm.quaternion.clone();

    // Same action identity and same wire progress is a duplicate, not a replay.
    players.applyPresence(snapshot({ x: 10, z: 20, animation: action }));
    players.update(0.1);
    expect(arm.quaternion.angleTo(first)).toBeGreaterThan(0.001);
    expect(players.latestPositionOf('char-b')?.toArray()).toEqual([10, 0, 20]);
  });

  it('clears a completed remote action when the next snapshot has no animation', () => {
    const scene = new THREE.Scene();
    const players = new RemotePlayers(scene, 'starter-island', () => 1_000);
    players.applyPresence(snapshot({ animation: {
      combatState: 'attack4', category: 'style', onGround: true,
      dashing: false, verticalVelocity: 0, attackProgress: 0.5,
    } }));
    const arm = scene.getObjectByName('player-rig:right-arm')!;
    players.update(0.05);
    const attacking = arm.quaternion.clone();

    players.applyPresence(snapshot({ animation: undefined }));
    players.update(0.05);
    expect(arm.quaternion.equals(attacking)).toBe(false);
  });

  it('does not replay a completed session/sequence but accepts the next sequence', () => {
    const replayScene = new THREE.Scene();
    const controlScene = new THREE.Scene();
    const replayPlayers = new RemotePlayers(replayScene, 'starter-island', () => 1_000);
    const controlPlayers = new RemotePlayers(controlScene, 'starter-island', () => 1_000);
    const action = (sequence: number) => ({
      combatState: 'attack1' as const,
      category: 'style' as const,
      onGround: true,
      dashing: false,
      verticalVelocity: 0,
      attackProgress: 0.5,
      actionSessionId: 'peer_12345',
      actionSequence: sequence,
    });

    replayPlayers.applyPresence(snapshot({ animation: action(1) }));
    controlPlayers.applyPresence(snapshot({ animation: action(1) }));
    replayPlayers.update(0.1);
    controlPlayers.update(0.1);
    replayPlayers.applyPresence(snapshot({ animation: undefined }));
    controlPlayers.applyPresence(snapshot({ animation: undefined }));
    replayPlayers.update(0.1);
    controlPlayers.update(0.1);

    // The old event arrives again after both renderers have returned to idle.
    replayPlayers.applyPresence(snapshot({ animation: action(1) }));
    controlPlayers.applyPresence(snapshot({ animation: undefined }));
    replayPlayers.update(0.1);
    controlPlayers.update(0.1);
    const replayArm = replayScene.getObjectByName('player-rig:right-arm')!;
    const controlArm = controlScene.getObjectByName('player-rig:right-arm')!;
    expect(replayArm.quaternion.angleTo(controlArm.quaternion)).toBeLessThan(1e-12);

    // A strictly newer sequence from the same runtime is a new action.
    replayPlayers.applyPresence(snapshot({ animation: action(2) }));
    replayPlayers.update(0.1);
    controlPlayers.update(0.1);
    expect(replayArm.quaternion.angleTo(controlArm.quaternion)).toBeGreaterThan(0.1);
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

  it('keeps every on-foot remote full-detail across device tiers and distance', () => {
    const scene = new THREE.Scene();
    const focus = new THREE.Vector3();
    for (const tier of ['low', 'medium', 'high'] as const) {
      const players = new RemotePlayers(scene, 'starter-island', () => 1_000, {
        focus: () => focus,
        tier,
      });
      const playerId = `char-${tier}`;
      players.applyPresence(snapshot({ playerId, x: 500, z: 0 }));
      expect(players.lodFor(playerId)).toBe('full');
      expect(scene.getObjectByName('remote-player:pirate-v1')).toBeTruthy();
    }
  });

  it('keeps full-rig action transforms for far and over-budget remotes', () => {
    const scene = new THREE.Scene();
    const focus = new THREE.Vector3();
    const players = new RemotePlayers(scene, 'starter-island', () => 1_000, {
      focus: () => focus,
      tier: 'low',
    });
    const states = [
      'attack1', 'attack2', 'attack3', 'attack4', 'casting', 'blocking',
      'stunned', 'knockback', 'knockdown', 'dead',
    ] as const;
    const remote = () => scene.getObjectByName('remote-player:pirate-v1') as THREE.Group;
    const animation = (combatState: 'idle' | typeof states[number]) => ({
      combatState,
      category: 'sword' as const,
      onGround: true,
      dashing: false,
      verticalVelocity: 0,
      attackProgress: 0.55,
      skillAnimationProgress: combatState === 'casting' ? 0.45 : 1,
      skillAnimationType: combatState === 'casting' ? 'beam' as const : undefined,
    });

    players.applyPresence(snapshot({ x: 500, z: 0, animation: animation('idle') }));
    expect(players.lodFor('char-b')).toBe('full');
    expect(countMeshes(remote())).toBeGreaterThan(3);
    for (const combatState of states) {
      players.applyPresence(snapshot({ x: 500, z: 0, animation: animation(combatState) }));
      let before = 0;
      remote().traverse((node) => { before += node.quaternion.angleTo(new THREE.Quaternion()) + node.position.length(); });
      players.update(0.1);
      let after = 0;
      remote().traverse((node) => { after += node.quaternion.angleTo(new THREE.Quaternion()) + node.position.length(); });
      expect(Math.abs(after - before)).toBeGreaterThan(0.001);
    }

    // Far remotes remain full detail while preserving a visible jump transform.
    players.applyPresence(snapshot({
      x: 500,
      y: 0,
      z: 0,
      animation: animation('idle'),
    }));
    players.applyPresence(snapshot({
      x: 500,
      y: 2,
      z: 0,
      animation: {
        ...animation('idle'),
        onGround: false,
        verticalVelocity: 7,
      },
    }));
    players.update(0.1);
    expect(remote().position.y).toBeGreaterThan(0);

    // No maxFull budget may downgrade a second visible on-foot remote.
    for (let index = 0; index < 12; index += 1) {
      const playerId = `budget-${index}`;
      players.applyPresence(snapshot({ playerId, x: 500 + index, z: 20 }));
      expect(players.lodFor(playerId)).toBe('full');
    }
  });

  it('predicts bounded 4Hz movement while rejecting a teleport-sized sample', () => {
    let now = 0;
    const scene = new THREE.Scene();
    const focus = new THREE.Vector3();
    const players = new RemotePlayers(scene, 'starter-island', () => now, {
      focus: () => focus,
      tier: 'high',
    });
    players.applyPresence(snapshot({ x: 100, y: 3, z: 100 }));
    const remote = () => scene.getObjectByName('remote-player:pirate-v1') as THREE.Group;

    let maxFrameStep = 0;
    let previousPosition = remote().position.clone();
    for (let sample = 1; sample <= 4; sample += 1) {
      for (let frame = 0; frame < 15; frame += 1) {
        now += 1000 / 60;
        players.update(1 / 60);
        maxFrameStep = Math.max(maxFrameStep, remote().position.distanceTo(previousPosition));
        previousPosition = remote().position.clone();
      }
      // Each network sample arrives after exactly 250ms (4Hz).
      players.applyPresence(snapshot({ x: 100 + sample, y: 3, z: 100 }));
    }
    for (let frame = 0; frame < 15; frame += 1) {
      now += 1000 / 60;
      players.update(1 / 60);
      maxFrameStep = Math.max(maxFrameStep, remote().position.distanceTo(previousPosition));
      previousPosition = remote().position.clone();
    }
    // Without bounded extrapolation the 4Hz target leaves the ghost below this.
    expect(remote().position.x).toBeGreaterThan(104.0);
    expect(remote().position.x).toBeLessThan(106);
    expect(maxFrameStep).toBeLessThan(1.01);
    // Render prediction must never replace the authoritative target used by combat.
    expect(players.latestPositionOf('char-b')?.toArray()).toEqual([104, 3, 100]);

    // A stationary sample clears velocity; idle remotes do not drift.
    now += 250;
    players.applyPresence(snapshot({ x: 104, y: 3, z: 100 }));
    const stoppedAt = remote().position.clone();
    for (let frame = 0; frame < 15; frame += 1) {
      now += 1000 / 60;
      players.update(1 / 60);
    }
    expect(remote().position.x).toBeLessThan(stoppedAt.x + 0.1);
    expect(remote().position.y).toBeLessThan(3.1);

    now += 250;
    players.applyPresence(snapshot({ x: 200, y: 3, z: 100 }));
    const beforeTeleportFrame = remote().position.clone();
    now += 1000 / 60;
    players.update(1 / 60);
    expect(remote().position.distanceTo(beforeTeleportFrame)).toBeLessThan(1.01);

    // Reconnect/re-spawn remains a fresh, targetable remote after the guard.
    players.remove('char-b');
    players.applyPresence(snapshot({ x: 104, z: 100, animation: {
      combatState: 'dead', category: 'style', onGround: true, dashing: false, verticalVelocity: 0,
    } }));
    players.markDefeated('char-b');
    players.markRespawn('char-b');
    expect(players.count).toBe(1);
    expect(players.targetsInCone(new THREE.Vector3(104, 0, 98), 0, 1, 5, Math.PI / 2)).toContain('char-b');
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

  it('keeps the remote dead pose visible through combat-defeat and ignores delayed actions until respawn', () => {
    const scene = new THREE.Scene();
    const players = new RemotePlayers(scene, 'starter-island', () => 1_000);
    const firstAttack = {
      combatState: 'attack4', category: 'sword', onGround: true, dashing: false,
      verticalVelocity: 0, attackProgress: 0.5,
      actionSessionId: 'peer_12345', actionSequence: 4,
    } as const;
    players.applyPresence(snapshot({ playerId: 'foe', x: 1, z: 1, animation: firstAttack }));
    players.markDefeated('foe');
    const remote = scene.getObjectByName('remote-player:pirate-v1') as THREE.Group;
    expect(remote.visible).toBe(true);
    players.update(0.1);
    expect(players.lodFor('foe')).toBe('full');
    expect(remote.visible).toBe(true);
    expect(scene.getObjectByName('player-rig:root')?.visible).toBe(true);

    // Control avatar advances through the same dead transition without the
    // delayed attack frame, so the comparison covers animator time progression.
    const controlScene = new THREE.Scene();
    const control = new RemotePlayers(controlScene, 'starter-island', () => 1_000);
    control.applyPresence(snapshot({ playerId: 'foe', x: 1, z: 1, animation: firstAttack }));
    control.markDefeated('foe');
    control.update(0.1);

    // A delayed pre-defeat frame must not replace the authoritative dead pose.
    const delayedAttack = {
      combatState: 'attack4', category: 'sword', onGround: true, dashing: false,
      verticalVelocity: 0, attackProgress: 0.9,
      actionSessionId: 'peer_12345', actionSequence: 4,
    } as const;
    players.applyPresence(snapshot({ playerId: 'foe', x: 1, z: 1, animation: delayedAttack }));
    players.update(0.1);
    control.update(0.1);
    const root = scene.getObjectByName('player-rig:root')!;
    const controlRoot = controlScene.getObjectByName('player-rig:root')!;
    expect(root.quaternion.angleTo(controlRoot.quaternion)).toBeLessThan(1e-12);
    expect(players.targetsInCone(new THREE.Vector3(), 0, 1, 20, Math.PI)).not.toContain('foe');

    players.markRespawn('foe');
    players.update(0.1);
    expect(players.targetsInCone(new THREE.Vector3(), 0, 1, 20, Math.PI)).toContain('foe');
  });

});
