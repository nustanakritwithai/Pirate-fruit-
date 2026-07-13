import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PlayerActionAnimator, type PlayerActionSnapshot } from '../../animation/PlayerActionAnimator';
import type { ActiveLoadoutItem, LoadoutCategory } from '../../progression/ProgressionTypes';
import { attachmentSocketsFromPirateRig } from '../CharacterRig';
import { EquipmentVisuals } from '../EquipmentVisuals';
import { createPiratePlayerVisual } from '../PiratePlayerVisual';

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

  it('locks every weapon grip to the Pirate V1 palm socket without moving the gameplay root', () => {
    const root = new THREE.Group();
    root.position.set(7, 2, -4);
    root.rotation.y = 0.45;
    const player = createPiratePlayerVisual();
    root.add(player.group);
    const sockets = attachmentSocketsFromPirateRig(player.rig);

    let active = item('sword', 'training-sword');
    const visuals = new EquipmentVisuals(root, () => active, sockets);
    const rootBefore = root.position.clone();
    visuals.update(1 / 60);

    const sword = root.getObjectByName('equipment:sword')!;
    const grip = root.getObjectByName('equipment:sword:grip')!;
    const expectedPalm = player.rig.rightPalmSocket.getWorldPosition(new THREE.Vector3());
    const gripPosition = grip.getWorldPosition(new THREE.Vector3());
    expect(gripPosition.distanceTo(expectedPalm)).toBeLessThan(0.005);

    player.rig.rightArm.rotation.x = -0.8;
    player.rig.rightForeArm.rotation.z = 0.42;
    const beforeRotation = sword.quaternion.clone();
    visuals.update(1 / 60);
    const movedPalm = player.rig.rightPalmSocket.getWorldPosition(new THREE.Vector3());
    grip.getWorldPosition(gripPosition);
    expect(gripPosition.distanceTo(movedPalm)).toBeLessThan(0.005);
    expect(beforeRotation.angleTo(sword.quaternion)).toBeGreaterThan(0.1);
    expect(root.position.equals(rootBefore)).toBe(true);

    active = item('gun', 'future-flintlock');
    visuals.update(1 / 60);
    const gunGrip = root.getObjectByName('equipment:gun:grip')!;
    expect(gunGrip.getWorldPosition(new THREE.Vector3()).distanceTo(movedPalm)).toBeLessThan(0.005);

    active = item('style', 'combat');
    visuals.update(1 / 60);
    const leftWrap = root.getObjectByName('equipment:style:left-hand')!;
    const rightWrap = root.getObjectByName('equipment:style:right-hand')!;
    const leftPalm = player.rig.leftPalmSocket.getWorldPosition(new THREE.Vector3());
    const rightPalm = player.rig.rightPalmSocket.getWorldPosition(new THREE.Vector3());
    expect(leftWrap.getWorldPosition(new THREE.Vector3()).distanceTo(leftPalm)).toBeLessThan(0.005);
    expect(rightWrap.getWorldPosition(new THREE.Vector3()).distanceTo(rightPalm)).toBeLessThan(0.005);
  });

  it('keeps the sword in the palm through locomotion, airborne, block and all combo poses', () => {
    const root = new THREE.Group();
    const player = createPiratePlayerVisual();
    root.add(player.group);
    const animator = new PlayerActionAnimator(player.rig);
    const visuals = new EquipmentVisuals(
      root,
      () => item('sword', 'training-sword'),
      attachmentSocketsFromPirateRig(player.rig),
    );
    const grip = root.getObjectByName('equipment:sword:grip')!;
    const snapshots: PlayerActionSnapshot[] = [
      { combatState: 'idle', category: 'sword', locomotion: 'idle', onGround: true },
      { combatState: 'idle', category: 'sword', locomotion: 'run', onGround: true },
      { combatState: 'idle', category: 'sword', locomotion: 'idle', onGround: false },
      { combatState: 'blocking', category: 'sword', locomotion: 'idle', onGround: true },
      ...(['attack1', 'attack2', 'attack3', 'attack4'] as const).map((combatState) => ({
        combatState,
        category: 'sword' as const,
        locomotion: 'idle' as const,
        onGround: true,
      })),
    ];

    for (const snapshot of snapshots) {
      for (let frame = 0; frame < 12; frame++) {
        animator.update(1 / 60, snapshot);
        visuals.update(1 / 60);
        const palmPosition = player.rig.rightPalmSocket.getWorldPosition(new THREE.Vector3());
        const gripPosition = grip.getWorldPosition(new THREE.Vector3());
        expect(gripPosition.distanceTo(palmPosition)).toBeLessThan(0.005);
      }
    }
  });
});
