import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createCrabVisual, createHumanoidVisual } from '../../art/CharacterVisuals';
import { PlayerActionAnimator } from '../PlayerActionAnimator';
import { ProceduralCharacterAnimator } from '../ProceduralCharacterAnimator';

function quaternionChanged(before: THREE.Quaternion, after: THREE.Quaternion): boolean {
  return before.angleTo(after) > 0.001;
}

function makeMixamoMock(): { root: THREE.Group; nodes: Map<string, THREE.Object3D> } {
  const root = new THREE.Group();
  const names = [
    'mixamorig:Hips',
    'mixamorig:Spine',
    'mixamorig:Spine2',
    'mixamorig:Head',
    'mixamorig:LeftArm',
    'mixamorig:LeftForeArm',
    'mixamorig:RightArm',
    'mixamorig:RightForeArm',
    'mixamorig:LeftUpLeg',
    'mixamorig:RightUpLeg',
  ];
  const nodes = new Map<string, THREE.Object3D>();
  for (const name of names) {
    const node = new THREE.Object3D();
    node.name = name;
    root.add(node);
    nodes.set(name, node);
  }
  return { root, nodes };
}

describe('Procedural character assets', () => {
  it('builds a humanoid with standard articulated pivots', () => {
    const visual = createHumanoidVisual({ clothColor: 0x446688, pirate: true, boss: true });

    expect(visual.rig.kind).toBe('humanoid');
    expect(visual.group.getObjectByName('rig:left-arm')).toBe(visual.rig.leftArm);
    expect(visual.group.getObjectByName('rig:right-leg')).toBe(visual.rig.rightLeg);
    expect(visual.group.getObjectByName('attachment:cutlass')).toBeTruthy();
  });

  it('animates humanoid locomotion/attack without moving the gameplay root', () => {
    const visual = createHumanoidVisual({ clothColor: 0x446688, pirate: true });
    const animator = new ProceduralCharacterAnimator(visual.rig);
    const worldPosition = visual.group.position.clone();
    const legBefore = visual.rig.leftLeg.quaternion.clone();

    animator.update(0.12, 'run');
    expect(quaternionChanged(legBefore, visual.rig.leftLeg.quaternion)).toBe(true);

    const armBefore = visual.rig.rightArm.quaternion.clone();
    animator.triggerAttack();
    animator.update(0.12, 'idle');
    expect(quaternionChanged(armBefore, visual.rig.rightArm.quaternion)).toBe(true);
    expect(visual.group.position.equals(worldPosition)).toBe(true);
  });

  it('animates crab claws and death through the same rig contract', () => {
    const visual = createCrabVisual(0xcf5a38);
    const animator = new ProceduralCharacterAnimator(visual.rig);
    const clawBefore = visual.rig.leftArm.quaternion.clone();

    animator.triggerAttack(true);
    animator.update(0.18, 'heavy');
    expect(quaternionChanged(clawBefore, visual.rig.leftArm.quaternion)).toBe(true);

    animator.update(0.1, 'idle', 1);
    expect(visual.rig.root.scale.x).toBeLessThan(1);
  });
});

describe('Mixamo player action overlay', () => {
  it('finds the Soldier rig and applies block/attack overlays', () => {
    const blocking = makeMixamoMock();
    const blockAnimator = new PlayerActionAnimator(blocking.root);
    const blockArm = blocking.nodes.get('mixamorig:RightArm')!;
    const beforeBlock = blockArm.quaternion.clone();

    blockAnimator.update(0.1, { combatState: 'blocking', category: 'style', onGround: true });
    expect(blockAnimator.rigReady).toBe(true);
    expect(quaternionChanged(beforeBlock, blockArm.quaternion)).toBe(true);

    const attacking = makeMixamoMock();
    const attackAnimator = new PlayerActionAnimator(attacking.root);
    const attackArm = attacking.nodes.get('mixamorig:RightArm')!;
    const beforeAttack = attackArm.quaternion.clone();
    attackAnimator.update(0.12, { combatState: 'attack1', category: 'sword', onGround: true });
    attackAnimator.update(0.12, { combatState: 'attack1', category: 'sword', onGround: true });
    expect(quaternionChanged(beforeAttack, attackArm.quaternion)).toBe(true);
  });
});
