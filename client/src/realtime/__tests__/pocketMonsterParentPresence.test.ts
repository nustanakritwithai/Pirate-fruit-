import { describe, expect, it, vi } from 'vitest';
import {
  PARENT_PRESENCE_AIRBORNE_LIFT,
  PIRATE_LOCAL_PRESENCE_MESSAGE,
  PIRATE_PRESENCE_SNAPSHOT_MESSAGE,
  PocketMonsterParentPresence,
  parsePiratePresenceSnapshotMessage,
  resolvePocketMonsterParentOrigin,
  toParentPresenceAnimation,
  toParentPresenceLocomotion,
  type ParentPresenceEvent,
  type ParentPresenceHost,
  type ParentPresenceLocalVisual,
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

  it('maps local jump/dash/attack/skill state onto the coarse parent vocabulary', () => {
    expect(toParentPresenceLocomotion({ locomotion: 'run', onGround: false, dashing: false })).toBe('jump');
    expect(toParentPresenceLocomotion({ locomotion: 'idle', onGround: true, dashing: true })).toBe('dash');
    expect(toParentPresenceLocomotion({ locomotion: 'walk', onGround: true, dashing: false })).toBe('walk');
    expect(toParentPresenceAnimation({
      locomotion: 'idle', onGround: true, dashing: false, combatState: 'idle',
    })).toBeNull();
    expect(toParentPresenceAnimation({
      locomotion: 'idle', onGround: false, dashing: false, combatState: 'idle',
    })).toEqual({ combatState: 'idle', onGround: false, dashing: false });
    expect(toParentPresenceAnimation({
      locomotion: 'idle', onGround: true, dashing: false, combatState: 'attack3', attackProgress: 0.4,
    })).toEqual({ combatState: 'attack', onGround: true, dashing: false, attackProgress: 0.4 });
    expect(toParentPresenceAnimation({
      locomotion: 'idle', onGround: true, dashing: false, combatState: 'casting', skillAnimationProgress: 0.55,
    })).toEqual({ combatState: 'skill', onGround: true, dashing: false, skillAnimationProgress: 0.55 });
    expect(toParentPresenceAnimation({
      locomotion: 'idle', onGround: true, dashing: false, combatState: 'blocking',
    })).toEqual({ combatState: 'guard', onGround: true, dashing: false });
    expect(toParentPresenceAnimation({
      locomotion: 'idle', onGround: true, dashing: false, combatState: 'knockback',
    })).toEqual({ combatState: 'hurt', onGround: true, dashing: false });
    expect(toParentPresenceAnimation({
      locomotion: 'idle', onGround: true, dashing: false, combatState: 'dead',
    })).toEqual({ combatState: 'dead', onGround: true, dashing: false });
  });

  it('publishes locomotion/animation alongside the pose when the visual provider supplies them', () => {
    let now = 1_000;
    const host = createHost();
    const sink = { setIsland: vi.fn(), applyPresence: vi.fn(), remove: vi.fn() };
    let visual: ParentPresenceLocalVisual = {
      locomotion: 'run', onGround: false, dashing: false, combatState: 'idle',
    };
    const bridge = new PocketMonsterParentPresence({
      targetOrigin: 'https://pocket.example',
      host: host.host,
      remotePlayers: sink,
      getPosition: () => ({ x: 1, y: 0, z: 2 }),
      getHeading: () => 0,
      getIslandId: () => 'starter-island',
      heightAt: () => 0,
      getActionVisual: () => visual,
      now: () => now,
    });

    bridge.start();
    expect(host.sent[0].message).toEqual({
      type: PIRATE_LOCAL_PRESENCE_MESSAGE,
      zone: 'pirate-fruit',
      x: 1,
      z: 2,
      dir: 0,
      locomotion: 'jump',
      animation: { combatState: 'idle', onGround: false, dashing: false },
    });

    now += 200;
    visual = { locomotion: 'idle', onGround: true, dashing: false, combatState: 'attack2', attackProgress: 0.4 };
    bridge.update();
    expect(host.sent[1].message).toMatchObject({
      locomotion: 'idle',
      animation: { combatState: 'attack', onGround: true, dashing: false, attackProgress: 0.4 },
    });

    now += 200;
    visual = { locomotion: 'idle', onGround: true, dashing: false, combatState: 'idle' };
    bridge.update();
    expect(host.sent[2].message).toMatchObject({ locomotion: 'idle' });
    expect(host.sent[2].message).not.toHaveProperty('animation');
  });

  it('parses per-player locomotion/animation and sanitizes unknown or malformed fields', () => {
    const snapshot = parsePiratePresenceSnapshotMessage({
      type: PIRATE_PRESENCE_SNAPSHOT_MESSAGE,
      payload: {
        zone: 'pirate-fruit',
        players: [
          {
            id: 'jumper', name: 'Jumper', x: 1, z: 1, dir: 0,
            locomotion: 'jump',
            animation: { combatState: 'attack', onGround: false, dashing: false, attackProgress: 2.5 },
          },
          {
            id: 'bad-fields', name: 'Bad', x: 2, z: 2, dir: 0,
            locomotion: 'fly',
            animation: { combatState: 'attack9', onGround: false },
          },
          { id: 'plain', name: 'Plain', x: 3, z: 3, dir: 0 },
        ],
      },
    });
    expect(snapshot?.players[0]).toEqual({
      id: 'jumper', name: 'Jumper', x: 1, z: 1, dir: 0,
      locomotion: 'jump',
      animation: { combatState: 'attack', onGround: false, dashing: false, attackProgress: 1 },
    });
    expect(snapshot?.players[1]).toEqual({
      id: 'bad-fields', name: 'Bad', x: 2, z: 2, dir: 0,
      locomotion: undefined,
      animation: undefined,
    });
    expect(snapshot?.players[2]).toEqual({
      id: 'plain', name: 'Plain', x: 3, z: 3, dir: 0,
      locomotion: undefined,
      animation: undefined,
    });
  });

  it('forwards action state to the remote sink and lifts airborne players', () => {
    const host = createHost();
    const sink = { setIsland: vi.fn(), applyPresence: vi.fn(), remove: vi.fn() };
    const bridge = new PocketMonsterParentPresence({
      targetOrigin: 'https://pocket.example',
      host: host.host,
      remotePlayers: sink,
      getPosition: () => ({ x: 0, y: 0, z: 0 }),
      getHeading: () => 0,
      getIslandId: () => 'starter-island',
      heightAt: () => 0.5,
      now: () => 1_000,
    });
    bridge.start();

    host.dispatch({
      data: {
        type: PIRATE_PRESENCE_SNAPSHOT_MESSAGE,
        payload: {
          zone: 'pirate-fruit',
          players: [
            {
              id: 'airborne', name: 'Air', x: 1, z: 1, dir: 0.5,
              locomotion: 'jump',
              animation: { combatState: 'idle', onGround: false, dashing: false },
            },
            {
              id: 'attacker', name: 'Atk', x: 2, z: 2, dir: 0,
              locomotion: 'idle',
              animation: { combatState: 'attack', onGround: true, dashing: false, attackProgress: 0.4 },
            },
            {
              id: 'caster', name: 'Cast', x: 3, z: 3, dir: 0,
              locomotion: 'idle',
              animation: { combatState: 'skill', onGround: true, dashing: false, skillAnimationProgress: 0.6 },
            },
          ],
        },
      },
      origin: 'https://pocket.example',
      source: host.parentSource,
    });

    const calls = sink.applyPresence.mock.calls.map((call) => call[0]);
    expect(calls[0]).toMatchObject({
      playerId: 'airborne',
      y: 0.5 + PARENT_PRESENCE_AIRBORNE_LIFT,
      locomotion: 'idle',
      animation: expect.objectContaining({ combatState: 'idle', onGround: false }),
    });
    expect(calls[1]).toMatchObject({
      playerId: 'attacker',
      y: 0.5,
      locomotion: 'idle',
      animation: expect.objectContaining({ combatState: 'attack1', attackProgress: 0.4, onGround: true }),
    });
    expect(calls[2]).toMatchObject({
      playerId: 'caster',
      locomotion: 'idle',
      animation: expect.objectContaining({ combatState: 'casting', skillAnimationProgress: 0.6 }),
    });
  });

  it('keeps the legacy movement-derived locomotion when action fields are absent', () => {
    const host = createHost();
    const sink = { setIsland: vi.fn(), applyPresence: vi.fn(), remove: vi.fn() };
    const bridge = new PocketMonsterParentPresence({
      targetOrigin: 'https://pocket.example',
      host: host.host,
      remotePlayers: sink,
      getPosition: () => ({ x: 0, y: 0, z: 0 }),
      getHeading: () => 0,
      getIslandId: () => 'starter-island',
      heightAt: () => 0,
      now: () => 1_000,
    });
    bridge.start();

    host.dispatch({
      data: {
        type: PIRATE_PRESENCE_SNAPSHOT_MESSAGE,
        payload: { zone: 'pirate-fruit', players: [{ id: 'bob', name: 'Bob', x: 0, z: 0, dir: 0 }] },
      },
      origin: 'https://pocket.example',
      source: host.parentSource,
    });
    expect(sink.applyPresence).toHaveBeenLastCalledWith(expect.objectContaining({
      playerId: 'bob', y: 0, locomotion: 'idle',
    }));

    host.dispatch({
      data: {
        type: PIRATE_PRESENCE_SNAPSHOT_MESSAGE,
        payload: { zone: 'pirate-fruit', players: [{ id: 'bob', name: 'Bob', x: 2, z: 0, dir: 0 }] },
      },
      origin: 'https://pocket.example',
      source: host.parentSource,
    });
    expect(sink.applyPresence).toHaveBeenLastCalledWith(expect.objectContaining({
      playerId: 'bob', y: 0, locomotion: 'run',
    }));
  });
});
