import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { Boat } from '../Boat';
import { authoritativeCannonShots, BoatWorldClient } from '../BoatWorldClient';
import type { BoatWorldSnapshot } from '@pirate-fruit/shared';

function boat(heading = 0): Boat {
  const group = new THREE.Group();
  group.updateMatrixWorld(true);
  return {
    heading,
    group,
    definition: {
      width: 4,
      cannonsPerSide: 2,
    },
  } as unknown as Boat;
}

describe('authoritative cannon presentation', () => {
  it('renders every cannon toward the Server-confirmed port side', () => {
    const shots = authoritativeCannonShots(boat(), 'port');

    expect(shots).toHaveLength(2);
    expect(shots.every(({ origin, endpoint }) => endpoint.x > origin.x)).toBe(true);
    expect(shots.map(({ origin }) => origin.z)).toEqual([-0.75, 0.75]);
  });

  it('mirrors the shot direction for starboard', () => {
    const shots = authoritativeCannonShots(boat(), 'starboard');

    expect(shots).toHaveLength(2);
    expect(shots.every(({ origin, endpoint }) => endpoint.x < origin.x)).toBe(true);
  });
});

describe('authoritative boat ownership handoff', () => {
  it('removes a provisional remote hull before applying the same entity as the local boat', () => {
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    scene.add(group);
    const dispose = vi.fn();
    const applyAuthoritativeBoat = vi.fn();
    const client = new BoatWorldClient(
      scene,
      () => 'self-character',
      { applyAuthoritativeBoat } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const internals = client as unknown as {
      rendered: Map<string, { boat: { group: THREE.Group; dispose(): void }; target: BoatWorldSnapshot }>;
    };
    const snapshot: BoatWorldSnapshot = {
      entityId: 'owned-boat',
      ownerId: 'self-character',
      definitionId: 'training-dinghy',
      islandId: 'starter-island',
      x: 4.2,
      z: -43,
      heading: Math.PI,
      speed: 0,
      hp: 130,
      maxHp: 130,
      anchor: true,
      state: 'docked',
      passengerIds: [],
    };
    internals.rendered.set(snapshot.entityId, {
      boat: { group, dispose },
      target: snapshot,
    });

    client.applyDelta(snapshot);

    expect(internals.rendered.has(snapshot.entityId)).toBe(false);
    expect(scene.children).not.toContain(group);
    expect(dispose).toHaveBeenCalledOnce();
    expect(applyAuthoritativeBoat).toHaveBeenCalledWith(snapshot, 'off');
  });
});
