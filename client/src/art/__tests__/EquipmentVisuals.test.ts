import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ActiveLoadoutItem, LoadoutCategory } from '../../progression/ProgressionTypes';
import { EquipmentVisuals, SOLDIER_PALM_OFFSETS } from '../EquipmentVisuals';

function item(category: LoadoutCategory, itemId: string = category): ActiveLoadoutItem {
  return { category, itemId, name: itemId };
}

describe('EquipmentVisuals', () => {
  it('shows exactly the visual matching the active loadout category', () => {
    const root = new THREE.Group();
    let active = item('style', 'combat');
    const visuals = new EquipmentVisuals(root, () => active);

    const categories: LoadoutCategory[] = ['style', 'sword', 'gun', 'fruit', 'utility'];
    for (const category of categories) {
      active = item(category, `${category}-test`);
      visuals.update(1 / 60);
      for (const candidate of categories) {
        expect(root.getObjectByName(`equipment:${candidate}`)?.visible).toBe(candidate === category);
      }
    }
  });

  it('keeps a single set of reusable equipment groups while switching items', () => {
    const root = new THREE.Group();
    let active = item('fruit', 'flame');
    const visuals = new EquipmentVisuals(root, () => active);
    const initialChildren = root.children.length;

    active = item('fruit', 'ice');
    visuals.update(1 / 60);

    expect(root.children).toHaveLength(initialChildren);
    expect(root.getObjectByName('equipment:fruit')?.visible).toBe(true);
  });

  it('follows character hand sockets without moving the gameplay root', () => {
    const root = new THREE.Group();
    root.position.set(7, 2, -4);
    root.rotation.y = 0.45;
    const leftHand = new THREE.Group();
    const rightHand = new THREE.Group();
    const hips = new THREE.Group();
    leftHand.position.set(-0.55, 1.25, 0.1);
    rightHand.position.set(0.55, 1.25, 0.1);
    hips.position.set(0, 0.95, 0);
    root.add(leftHand, rightHand, hips);

    let active = item('sword', 'training-sword');
    const visuals = new EquipmentVisuals(root, () => active, { leftHand, rightHand, hips });
    const rootBefore = root.position.clone();
    visuals.update(1 / 60);

    const sword = root.getObjectByName('equipment:sword')!;
    const grip = root.getObjectByName('equipment:sword:grip')!;
    const expectedPalm = rightHand.localToWorld(new THREE.Vector3(...SOLDIER_PALM_OFFSETS.right));
    const gripPosition = grip.getWorldPosition(new THREE.Vector3());
    expect(gripPosition.distanceTo(expectedPalm)).toBeLessThan(0.005);

    rightHand.position.x += 0.35;
    rightHand.rotation.z = 0.65;
    const beforeRotation = sword.quaternion.clone();
    visuals.update(1 / 60);
    const movedPalm = rightHand.localToWorld(new THREE.Vector3(...SOLDIER_PALM_OFFSETS.right));
    grip.getWorldPosition(gripPosition);
    expect(gripPosition.distanceTo(movedPalm)).toBeLessThan(0.005);
    expect(beforeRotation.angleTo(sword.quaternion)).toBeGreaterThan(0.1);
    expect(root.position.equals(rootBefore)).toBe(true);

    active = item('style', 'combat');
    visuals.update(1 / 60);
    const leftWrap = root.getObjectByName('equipment:style:left-hand')!;
    const rightWrap = root.getObjectByName('equipment:style:right-hand')!;
    const leftPalm = leftHand.localToWorld(new THREE.Vector3(...SOLDIER_PALM_OFFSETS.left));
    const rightPalm = rightHand.localToWorld(new THREE.Vector3(...SOLDIER_PALM_OFFSETS.right));
    expect(leftWrap.getWorldPosition(new THREE.Vector3()).distanceTo(leftPalm)).toBeLessThan(0.005);
    expect(rightWrap.getWorldPosition(new THREE.Vector3()).distanceTo(rightPalm)).toBeLessThan(0.005);
  });
});
