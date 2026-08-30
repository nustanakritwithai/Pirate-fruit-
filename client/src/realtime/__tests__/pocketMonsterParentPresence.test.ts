import { describe, expect, it, vi } from 'vitest';
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
});
