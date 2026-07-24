import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Boat } from '../Boat';
import { authoritativeCannonShots } from '../BoatWorldClient';

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
