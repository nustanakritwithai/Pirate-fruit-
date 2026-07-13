import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Effects, getForwardArcRotation, SLASH_ARC_LENGTH } from '../Effects';

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

describe('animated combat effects', () => {
  it('anchors the newest edge of a blade trail to the real blade segment', () => {
    const scene = new THREE.Scene();
    const effects = new Effects(scene);
    const base = new THREE.Vector3(0.55, 1.1, 0.65);
    const tip = new THREE.Vector3(0.8, 2.05, 1.25);

    effects.spawnBladeTrail(base, tip, new THREE.Vector3(), 0, 1, 0x9fdcff);

    const root = scene.getObjectByName('effect:blade-trail')!;
    const ribbon = root.children[0] as THREE.Mesh<THREE.BufferGeometry>;
    const positions = ribbon.geometry.getAttribute('position') as THREE.BufferAttribute;
    const lastBase = new THREE.Vector3().fromBufferAttribute(positions, positions.count - 2);
    const lastTip = new THREE.Vector3().fromBufferAttribute(positions, positions.count - 1);
    expect(lastBase.distanceTo(base)).toBeLessThan(0.0001);
    expect(lastTip.distanceTo(tip)).toBeLessThan(0.0001);
  });

  it('animates muzzle flash, tracer, bullet and impact then cleans all of them up', () => {
    const scene = new THREE.Scene();
    const effects = new Effects(scene);
    effects.spawnGunShot(
      new THREE.Vector3(1, 1.2, 2),
      new THREE.Vector3(1, 1.2, 7),
      0xffd477,
      true,
    );

    expect(scene.getObjectByName('effect:muzzle-flash')).toBeTruthy();
    expect(scene.getObjectByName('effect:gun-tracer')).toBeTruthy();
    expect(scene.getObjectByName('effect:gun-bullet')).toBeTruthy();
    effects.update(0.06);
    expect(scene.getObjectByName('effect:gun-bullet')!.position.z).toBeGreaterThan(2);
    expect(scene.getObjectByName('effect:bullet-impact')).toBeUndefined();
    effects.update(0.04);
    expect(scene.getObjectByName('effect:bullet-impact')).toBeTruthy();

    for (let i = 0; i < 8; i++) effects.update(0.1);
    expect(scene.getObjectByName('effect:gun-shot')).toBeUndefined();
    expect(scene.getObjectByName('effect:muzzle-flash')).toBeUndefined();
    expect(scene.getObjectByName('effect:bullet-impact')).toBeUndefined();
  });

  it('pulses an energy projectile, emits a trail and disposes its materials on burst', () => {
    const scene = new THREE.Scene();
    const effects = new Effects(scene);
    const visual = effects.createEnergyProjectile(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
      0x74e8ff,
      1.2,
    );
    const disposed = vi.fn();
    visual.materials[0].addEventListener('dispose', disposed);

    effects.updateEnergyProjectile(visual, 0.07, 1);
    expect(scene.getObjectByName('effect:energy-trail')).toBeTruthy();
    expect(visual.core.rotation.x).toBeGreaterThan(0);
    effects.destroyEnergyProjectile(visual);

    expect(scene.getObjectByName('effect:energy-projectile')).toBeUndefined();
    expect(scene.getObjectByName('effect:energy-impact')).toBeTruthy();
    expect(disposed).toHaveBeenCalledOnce();
    for (let i = 0; i < 8; i++) effects.update(0.1);
    expect(scene.getObjectByName('effect:energy-impact')).toBeUndefined();
    expect(scene.getObjectByName('effect:energy-trail')).toBeUndefined();
  });
});
