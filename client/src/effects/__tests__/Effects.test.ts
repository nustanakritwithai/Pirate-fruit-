import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getForwardArcRotation, SLASH_ARC_LENGTH } from '../Effects';

describe('forward attack arc orientation', () => {
  it.each([0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.73])(
    'keeps the visible arc midpoint in front at heading %f',
    (heading) => {
      const localMidpoint = SLASH_ARC_LENGTH / 2;
      const flattenedAngle = localMidpoint + getForwardArcRotation(heading);
      const arcDirection = new THREE.Vector3(
        Math.cos(flattenedAngle),
        0,
        -Math.sin(flattenedAngle),
      );
      const characterForward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));

      expect(arcDirection.dot(characterForward)).toBeCloseTo(1, 6);
    },
  );

  it('also centers the projectile arc, which uses a narrower angle', () => {
    const heading = 1.17;
    const length = Math.PI * 0.8;
    const flattenedAngle = length / 2 + getForwardArcRotation(heading, length);
    const arcDirection = new THREE.Vector3(
      Math.cos(flattenedAngle),
      0,
      -Math.sin(flattenedAngle),
    );
    const characterForward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));

    expect(arcDirection.dot(characterForward)).toBeCloseTo(1, 6);
  });
});
