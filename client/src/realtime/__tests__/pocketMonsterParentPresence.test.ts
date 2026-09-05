import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { PlayerActionSnapshot } from '../../animation/PlayerActionAnimator';
import { RemotePlayers } from '../RemotePlayers';
import {
  PIRATE_LOCAL_PRESENCE_MESSAGE,
  PIRATE_PRESENCE_SNAPSHOT_MESSAGE,
  PocketMonsterParentPresence,
  parsePiratePresenceSnapshotMessage,
  resolvePocketMonsterParentOrigin,
  type ParentPresenceEvent,
  type ParentPresenceHost,
} from '../PocketMonsterParentPresence';

function createHost() {
  let listener: ((event: ParentPresenceEvent) => void) | null = null;
  const sent: Array<{ message: unknown; targetOrigin: string }> = [];
  const parentSource = {};
  const host: ParentPresenceHost = {
    addMessageListener(next) { listener = next; },
    removeMessageListener(next) { if (listener === next) listener = null; },
    postToParent(message, targetOrigin) { sent.push({ message, targetOrigin }); },
    isParentSource(source) { return source === parentSource; },
  };
  return {
    host,
    sent,
    parentSource,
    dispatch(event: ParentPresenceEvent) { listener?.(event); },
    hasListener: () => listener !== null,
  };
}

describe('Pocket Monster parent presence bridge', () => {
  it('enables only for an embedded frame with an explicit origin-only parentOrigin', () => {
    expect(resolvePocketMonsterParentOrigin(
      '?parentOrigin=https%3A%2F%2Fpocket.example',
      'https://pirate.example',
      true,
    )).toBe('https://pocket.example');
    expect(resolvePocketMonsterParentOrigin('', 'https://pirate.example', true)).toBeNull();
    expect(resolvePocketMonsterParentOrigin(
      '?parentOrigin=https%3A%2F%2Fpocket.example%2Fpath',
      'https://pirate.example',
      true,
    )).toBeNull();
    expect(resolvePocketMonsterParentOrigin(
      '?parentOrigin=https%3A%2F%2Fpocket.example',
      'https://pirate.example',
      false,
    )).toBeNull();
  });

  it('sanitizes the Pirate Fruit snapshot and drops wrong-zone or non-finite players', () => {
    expect(parsePiratePresenceSnapshotMessage({
      type: PIRATE_PRESENCE_SNAPSHOT_MESSAGE,
      payload: {
        zone: 'pirate-fruit',
        players: [
          { id: 'alice', name: 'Alice', x: 2, z: 3, dir: 0.5 },
          { id: 'bad-x', name: 'Bad', x: Number.NaN, z: 3, dir: 0 },
          { id: 'bad-z', name: 'Bad', x: 1, z: Number.POSITIVE_INFINITY, dir: 0 },
          { id: 'alice', name: 'Duplicate', x: 9, z: 9, dir: 0 },
        ],
      },
    })).toEqual({
      zone: 'pirate-fruit',
      players: [{ id: 'alice', name: 'Alice', x: 2, z: 3, dir: 0.5 }],
    });
    expect(parsePiratePresenceSnapshotMessage({
      type: PIRATE_PRESENCE_SNAPSHOT_MESSAGE,
      payload: { zone: 'hub', players: [] },
    })).toBeNull();
  });

  it('publishes real local pose, accepts only the exact parent and removes absent players', () => {
    let now = 1_000;
    const host = createHost();
    const sink = {
      setIsland: vi.fn(),
      applyPresence: vi.fn(),
      remove: vi.fn(),
    };
    const bridge = new PocketMonsterParentPresence({
      targetOrigin: 'https://pocket.example',
      host: host.host,
      remotePlayers: sink,
      getPosition: () => ({ x: 7, y: 2, z: 11.5 }),
      getHeading: () => 0.75,
      getIslandId: () => 'starter-island',
      heightAt: (x, z) => x + z,
      now: () => now,
    });

    bridge.start();
    expect(host.sent).toEqual([{
      targetOrigin: 'https://pocket.example',
      message: {
        type: PIRATE_LOCAL_PRESENCE_MESSAGE,
        zone: 'pirate-fruit',
        x: 7,
        y: 2,
        z: 11.5,
        dir: 0.75,
      },
    }]);

    const snapshot = {
      type: PIRATE_PRESENCE_SNAPSHOT_MESSAGE,
      payload: {
        zone: 'pirate-fruit',
        players: [{ id: 'bob', name: 'Bob', x: 3, z: 4, dir: 1.2 }],
      },
    };
    host.dispatch({ data: snapshot, origin: 'https://evil.example', source: host.parentSource });
    host.dispatch({ data: snapshot, origin: 'https://pocket.example', source: {} });
    expect(sink.applyPresence).not.toHaveBeenCalled();

    host.dispatch({ data: snapshot, origin: 'https://pocket.example', source: host.parentSource });
    expect(sink.applyPresence).toHaveBeenCalledWith(expect.objectContaining({
      playerId: 'bob',
      islandId: 'starter-island',
      x: 3,
      y: 7,
      z: 4,
      heading: 1.2,
      onBoat: false,
    }));

    host.dispatch({
      data: { type: PIRATE_PRESENCE_SNAPSHOT_MESSAGE, payload: { zone: 'pirate-fruit', players: [] } },
      origin: 'https://pocket.example',
      source: host.parentSource,
    });
    expect(sink.remove).toHaveBeenCalledWith('bob');

    now += 100;
    bridge.update();
    expect(host.sent).toHaveLength(2);
    bridge.dispose();
    expect(host.hasListener()).toBe(false);
  });

  it('preserves the complete animator snapshot and strips invalid short-action metadata as a group', () => {
    const rich = {
      combatState: 'casting',
      category: 'fruit',
      onGround: false,
      dashing: true,
      verticalVelocity: 150,
      attackProgress: -1,
      hitReactionId: 4,
      hitReactionAngle: 99,
      skillAnimationProgress: 0.4,
      skillAnimationReleaseProgress: 0.25,
      skillAnimationType: 'beam',
      skillAnimationVariant: 3,
      skillAnimationUltimate: true,
      skillAnimationCategory: 'fruit',
      actionSessionId: 'session_A1',
      actionSequence: 9,
      actionDurationMs: 900,
    };
    expect(parsePiratePresenceSnapshotMessage({
      type: PIRATE_PRESENCE_SNAPSHOT_MESSAGE,
      payload: {
        zone: 'pirate-fruit',
        players: [{ id: 'caster', name: 'Caster', x: 2, y: 3, z: 4, dir: 0.5, locomotion: 'swim', animation: rich }],
      },
    })?.players[0]).toEqual({
      id: 'caster', name: 'Caster', x: 2, y: 3, z: 4, dir: 0.5, locomotion: 'swim',
      animation: {
        ...rich,
        verticalVelocity: 100,
        attackProgress: 0,
        hitReactionAngle: Math.PI,
      },
    });

    const malformed = parsePiratePresenceSnapshotMessage({
      type: PIRATE_PRESENCE_SNAPSHOT_MESSAGE,
      payload: {
        zone: 'pirate-fruit',
        players: [{
          id: 'legacy', name: 'Legacy', x: 0, z: 0, dir: 0,
          locomotion: 'jump',
          animation: {
            combatState: 'attack2', category: 'sword', onGround: true, dashing: false,
            verticalVelocity: 0, actionSessionId: 'short', actionSequence: 1, actionDurationMs: 750,
          },
        }],
      },
    })?.players[0];
    expect(malformed).toEqual({
      id: 'legacy', name: 'Legacy', x: 0, z: 0, dir: 0,
      animation: {
        combatState: 'attack2', category: 'sword', onGround: true, dashing: false, verticalVelocity: 0,
      },
    });

    const currentState = parsePiratePresenceSnapshotMessage({
      type: PIRATE_PRESENCE_SNAPSHOT_MESSAGE,
      payload: {
        zone: 'pirate-fruit',
        players: [{
          id: 'guard', name: 'Guard', x: 0, z: 0, dir: 0,
          animation: {
            combatState: 'blocking', category: 'sword', onGround: true, dashing: false,
            verticalVelocity: 0, actionSessionId: 'session_A1', actionSequence: 10, actionDurationMs: 750,
          },
        }],
      },
    })?.players[0];
    expect(currentState?.animation).toEqual({
      combatState: 'blocking', category: 'sword', onGround: true, dashing: false, verticalVelocity: 0,
    });
  });

  it('samples before throttling and latches a short action under one session/sequence', () => {
    let now = 1_000;
    let visual: PlayerActionSnapshot = {
      combatState: 'idle', category: 'style', locomotion: 'idle',
      onGround: true, dashing: false, verticalVelocity: 0,
    };
    const host = createHost();
    const bridge = new PocketMonsterParentPresence({
      targetOrigin: 'https://pocket.example',
      host: host.host,
      remotePlayers: { setIsland: vi.fn(), applyPresence: vi.fn(), remove: vi.fn() },
      getPosition: () => ({ x: 1, y: 2, z: 3 }),
      getHeading: () => 0.25,
      getIslandId: () => 'starter-island',
      heightAt: () => 0,
      getActionSnapshot: () => visual,
      actionSessionId: 'runtime_1234',
      now: () => now,
    });

    bridge.start();
    expect(host.sent[0].message).toMatchObject({
      x: 1, y: 2, z: 3, locomotion: 'idle',
      animation: { combatState: 'idle', category: 'style' },
    });

    now += 10;
    visual = {
      combatState: 'attack2', category: 'sword', locomotion: 'idle',
      onGround: true, dashing: false, verticalVelocity: 0, attackProgress: 0.45,
    };
    bridge.update();
    expect(host.sent).toHaveLength(1);

    now += 10;
    visual = {
      combatState: 'idle', category: 'sword', locomotion: 'idle',
      onGround: true, dashing: false, verticalVelocity: 0,
    };
    bridge.update();
    now = 1_100;
    bridge.update();
    expect(host.sent[1].message).toMatchObject({
      animation: {
        combatState: 'attack2', category: 'sword', attackProgress: 0.45,
        actionSessionId: 'runtime_1234', actionSequence: 1, actionDurationMs: 750,
      },
    });

    now = 1_761;
    bridge.update();
    expect(host.sent.at(-1)?.message).toMatchObject({
      animation: { combatState: 'idle', category: 'sword' },
    });
    expect(host.sent.at(-1)?.message).not.toHaveProperty('animation.actionSessionId');
  });

  it('forwards optional y/rich animation to the real remote animator and does not restart a duplicate action', () => {
    const scene = new THREE.Scene();
    const players = new RemotePlayers(scene, 'starter-island', () => 1_000);
    const host = createHost();
    const bridge = new PocketMonsterParentPresence({
      targetOrigin: 'https://pocket.example', host: host.host, remotePlayers: players,
      getPosition: () => ({ x: 0, y: 0, z: 0 }), getHeading: () => 0,
      getIslandId: () => 'starter-island', heightAt: () => 99, now: () => 1_000,
    });
    bridge.start();
    const dispatch = (sequence: number) => host.dispatch({
      data: {
        type: PIRATE_PRESENCE_SNAPSHOT_MESSAGE,
        payload: { zone: 'pirate-fruit', players: [{
          id: 'fighter', name: 'Fighter', x: 1, y: 4, z: 2, dir: 0,
          locomotion: 'idle',
          animation: {
            combatState: 'attack1', category: 'style', onGround: true, dashing: false,
            verticalVelocity: 0, actionSessionId: 'peer_12345', actionSequence: sequence,
            actionDurationMs: 750,
          },
        }] },
      },
      origin: 'https://pocket.example', source: host.parentSource,
    });

    dispatch(1);
    players.update(0.1);
    const arm = scene.getObjectByName('player-rig:right-arm')!;
    const firstFrame = arm.quaternion.clone();
    expect((scene.getObjectByName('remote-player:pirate-v1') as { position: { y: number } }).position.y).toBe(4);
    dispatch(1);
    players.update(0.1);
    const duplicateFrame = arm.quaternion.clone();
    expect(duplicateFrame.equals(firstFrame)).toBe(false);

    dispatch(2);
    players.update(0.1);
    const restartedFrame = arm.quaternion.clone();
    expect(restartedFrame.angleTo(firstFrame)).toBeLessThan(restartedFrame.angleTo(duplicateFrame));
  });
});
