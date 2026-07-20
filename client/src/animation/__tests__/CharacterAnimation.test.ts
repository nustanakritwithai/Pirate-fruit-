import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createCrabVisual, createHumanoidVisual } from '../../art/CharacterVisuals';
import { PlayerActionAnimator } from '../PlayerActionAnimator';
import { ProceduralCharacterAnimator } from '../ProceduralCharacterAnimator';
import { createPiratePlayerVisual } from '../../art/PiratePlayerVisual';

function quaternionChanged(before: THREE.Quaternion, after: THREE.Quaternion): boolean {
  return before.angleTo(after) > 0.001;
}

function poseDistance(a: THREE.Quaternion[], b: THREE.Quaternion[]): number {
  return a.reduce((sum, quaternion, index) => sum + quaternion.angleTo(b[index]), 0);
}

describe('Procedural character assets', () => {
  it('builds a humanoid with standard articulated pivots', () => {
    const visual = createHumanoidVisual({ clothColor: 0x446688, pirate: true, boss: true });

    expect(visual.rig.kind).toBe('humanoid');
    expect(visual.group.getObjectByName('rig:left-arm')).toBe(visual.rig.leftArm);
    expect(visual.group.getObjectByName('rig:right-leg')).toBe(visual.rig.rightLeg);
    expect(visual.group.getObjectByName('attachment:cutlass')).toBeTruthy();
    let meshes = 0;
    visual.group.traverse((object) => {
      if (object instanceof THREE.Mesh) meshes++;
    });
    expect(meshes).toBeLessThanOrEqual(6);
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

describe('Pirate V1 player rig', () => {
  it('builds a new mobile-PBR player with explicit palm and hip sockets', () => {
    const visual = createPiratePlayerVisual();

    expect(visual.group.name).toBe('player:pirate-v1');
    expect(visual.group.getObjectByName('socket:left-palm')).toBe(visual.rig.leftPalmSocket);
    expect(visual.group.getObjectByName('socket:right-palm')).toBe(visual.rig.rightPalmSocket);
    expect(visual.group.getObjectByName('player:right-palm-up')).toBe(visual.rig.rightPalmVisual);
    expect(visual.group.getObjectByName('socket:hips')).toBe(visual.rig.hipsSocket);
    expect(visual.group.getObjectByName('mixamorig:RightHand')).toBeUndefined();

    const authoredPalmNormal = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(visual.rig.rightPalmVisual.quaternion);
    expect(authoredPalmNormal.y).toBeGreaterThan(0.99);
    expect(visual.rig.rightPalmSocket.position.z).toBeGreaterThan(0);
  });

  it('keeps the new player inside the mobile hero geometry budget and human proportions', () => {
    const visual = createPiratePlayerVisual();
    const bounds = new THREE.Box3().setFromObject(visual.group);
    let triangles = 0;
    let meshes = 0;
    const materialSlots = new Set<THREE.Material>();
    visual.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      meshes++;
      const geometry = mesh.geometry;
      triangles += geometry.index
        ? geometry.index.count / 3
        : geometry.getAttribute('position').count / 3;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      expect(materials.every((material) => material instanceof THREE.MeshStandardMaterial)).toBe(true);
      for (const material of materials) materialSlots.add(material);
    });

    const size = bounds.getSize(new THREE.Vector3());
    expect(meshes).toBeGreaterThan(12);
    expect(meshes).toBeLessThanOrEqual(20);
    expect(materialSlots.size).toBeLessThanOrEqual(3);
    expect(triangles).toBeLessThan(20_000);
    expect(size.y).toBeGreaterThan(1.9);
    expect(size.y).toBeLessThan(2.6);
    expect(size.y / size.x).toBeGreaterThan(1.45);
    expect(bounds.min.y).toBeGreaterThan(-0.12);
  });

  it('keeps the sword-side palm visibly facing upward in the ready stance', () => {
    const visual = createPiratePlayerVisual();
    const animator = new PlayerActionAnimator(visual.rig);
    animator.update(1 / 60, {
      combatState: 'idle',
      category: 'sword',
      locomotion: 'idle',
      onGround: true,
    });
    visual.group.updateMatrixWorld(true);

    const palmNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(
      visual.rig.rightPalmVisual.getWorldQuaternion(new THREE.Quaternion()),
    );
    expect(palmNormal.y).toBeGreaterThan(0.6);
  });

  it('animates locomotion and combat while restoring bind pose without drift', () => {
    const visual = createPiratePlayerVisual();
    const animator = new PlayerActionAnimator(visual.rig);
    const gameplayRootBefore = visual.group.position.clone();
    const legBefore = visual.rig.leftLeg.quaternion.clone();

    animator.update(0.12, {
      combatState: 'idle', category: 'style', locomotion: 'run', onGround: true,
    });
    expect(quaternionChanged(legBefore, visual.rig.leftLeg.quaternion)).toBe(true);

    animator.update(0.12, {
      combatState: 'attack1', category: 'sword', locomotion: 'idle', onGround: true,
    });
    const armAtWindup = visual.rig.rightArm.quaternion.clone();
    animator.update(0.12, {
      combatState: 'attack1', category: 'sword', locomotion: 'idle', onGround: true,
    });
    expect(quaternionChanged(armAtWindup, visual.rig.rightArm.quaternion)).toBe(true);
    expect(animator.rigReady).toBe(true);
    expect(visual.group.position.equals(gameplayRootBefore)).toBe(true);

    for (let i = 0; i < 240; i++) {
      animator.update(1 / 60, {
        combatState: 'idle', category: 'style', locomotion: 'idle', onGround: true,
      });
    }
    expect(visual.rig.rightArm.quaternion.length()).toBeCloseTo(1, 5);
  });

  it('uses a dedicated forward-leaning pose while dashing', () => {
    const visual = createPiratePlayerVisual();
    const animator = new PlayerActionAnimator(visual.rig);
    const gameplayRootBefore = visual.group.position.clone();
    animator.update(1 / 60, {
      combatState: 'idle', category: 'sword', locomotion: 'idle', onGround: true,
    });
    const spineBefore = visual.rig.spine.quaternion.clone();

    animator.update(1 / 60, {
      combatState: 'idle',
      category: 'sword',
      locomotion: 'idle',
      onGround: true,
      dashing: true,
      verticalVelocity: 0,
    });

    expect(quaternionChanged(spineBefore, visual.rig.spine.quaternion)).toBe(true);
    expect(visual.rig.root.position.z).toBeGreaterThan(0.03);
    expect(visual.rig.leftLeg.quaternion.angleTo(visual.rig.rightLeg.quaternion)).toBeGreaterThan(0.6);
    expect(visual.group.position.equals(gameplayRootBefore)).toBe(true);
  });

  it('uses distinct rising, apex and falling jump silhouettes', () => {
    const poseAt = (verticalVelocity: number): THREE.Quaternion[] => {
      const visual = createPiratePlayerVisual();
      const animator = new PlayerActionAnimator(visual.rig);
      animator.update(1 / 60, {
        combatState: 'idle',
        category: 'style',
        locomotion: 'idle',
        onGround: false,
        verticalVelocity,
      });
      return [
        visual.rig.spine.quaternion.clone(),
        visual.rig.leftArm.quaternion.clone(),
        visual.rig.leftLeg.quaternion.clone(),
        visual.rig.leftLowerLeg.quaternion.clone(),
      ];
    };

    const rising = poseAt(7.5);
    const apex = poseAt(0);
    const falling = poseAt(-7.5);
    expect(poseDistance(rising, apex)).toBeGreaterThan(0.55);
    expect(poseDistance(apex, falling)).toBeGreaterThan(0.45);
    expect(poseDistance(rising, falling)).toBeGreaterThan(0.65);
  });

  it('squashes on landing and settles back to the bind-height envelope', () => {
    const visual = createPiratePlayerVisual();
    const animator = new PlayerActionAnimator(visual.rig);
    animator.update(1 / 60, {
      combatState: 'idle',
      category: 'style',
      locomotion: 'idle',
      onGround: false,
      verticalVelocity: -8,
    });
    animator.update(1 / 60, {
      combatState: 'idle',
      category: 'style',
      locomotion: 'idle',
      onGround: true,
      verticalVelocity: 0,
    });
    expect(visual.rig.root.position.y).toBeLessThan(-0.07);
    expect(visual.rig.root.scale.y).toBeLessThan(0.97);

    for (let frame = 0; frame < 18; frame++) {
      animator.update(1 / 60, {
        combatState: 'idle',
        category: 'style',
        locomotion: 'idle',
        onGround: true,
        verticalVelocity: 0,
      });
    }
    expect(visual.rig.root.position.y).toBeGreaterThan(-0.02);
    expect(visual.rig.root.scale.y).toBeCloseTo(1, 4);
  });

  it('plays directional hit reactions without replacing the current combat state', () => {
    const reactionAt = (hitReactionAngle: number) => {
      const visual = createPiratePlayerVisual();
      const animator = new PlayerActionAnimator(visual.rig);
      animator.update(1 / 60, {
        combatState: 'idle',
        category: 'style',
        locomotion: 'idle',
        onGround: true,
        hitReactionId: 1,
        hitReactionAngle,
      });
      return {
        rootPosition: visual.rig.root.position.clone(),
        spine: visual.rig.spine.quaternion.clone(),
      };
    };

    const front = reactionAt(0);
    const right = reactionAt(Math.PI / 2);
    const left = reactionAt(-Math.PI / 2);
    expect(front.rootPosition.z).toBeLessThan(-0.05);
    expect(front.spine.angleTo(new THREE.Quaternion())).toBeGreaterThan(0.2);
    expect(right.rootPosition.x).toBeLessThan(-0.04);
    expect(left.rootPosition.x).toBeGreaterThan(0.04);
  });

  it('gives stunned, knockback and knockdown their own impact poses', () => {
    const poseAt = (combatState: 'stunned' | 'knockback' | 'knockdown') => {
      const visual = createPiratePlayerVisual();
      const animator = new PlayerActionAnimator(visual.rig);
      const snapshot = {
        combatState,
        category: 'style' as const,
        locomotion: 'idle' as const,
        onGround: true,
      };
      animator.update(0.08, snapshot);
      animator.update(0.08, snapshot);
      return [
        visual.rig.root.quaternion.clone(),
        visual.rig.spine.quaternion.clone(),
        visual.rig.leftArm.quaternion.clone(),
        visual.rig.rightLeg.quaternion.clone(),
      ];
    };

    const stunned = poseAt('stunned');
    const knockback = poseAt('knockback');
    const knockdown = poseAt('knockdown');
    expect(poseDistance(stunned, knockback)).toBeGreaterThan(0.55);
    expect(poseDistance(stunned, knockdown)).toBeGreaterThan(0.8);
    expect(poseDistance(knockback, knockdown)).toBeGreaterThan(0.8);
  });

  it('gives all four sword combo steps visibly different full-body poses', () => {
    const states = ['attack1', 'attack2', 'attack3', 'attack4'] as const;
    const poses = states.map((combatState) => {
      const visual = createPiratePlayerVisual();
      const animator = new PlayerActionAnimator(visual.rig);
      animator.update(1 / 60, {
        combatState,
        category: 'sword',
        locomotion: 'idle',
        onGround: true,
        attackProgress: 0.52,
      });
      return [
        visual.rig.root.quaternion.clone(),
        visual.rig.spine.quaternion.clone(),
        visual.rig.rightArm.quaternion.clone(),
        visual.rig.leftArm.quaternion.clone(),
        visual.rig.rightLeg.quaternion.clone(),
      ];
    });

    for (let i = 0; i < poses.length; i++) {
      for (let j = i + 1; j < poses.length; j++) {
        expect(poseDistance(poses[i], poses[j])).toBeGreaterThan(0.35);
      }
    }
  });

  it('uses a relaxed asymmetric idle with soft knees and slow weight transfer', () => {
    const visual = createPiratePlayerVisual();
    const animator = new PlayerActionAnimator(visual.rig);
    const gameplayRootBefore = visual.group.position.clone();
    const leftKneeBind = visual.rig.leftLowerLeg.quaternion.clone();
    const rightKneeBind = visual.rig.rightLowerLeg.quaternion.clone();
    const snapshot = {
      combatState: 'idle' as const,
      category: 'utility' as const,
      locomotion: 'idle' as const,
      onGround: true,
    };

    animator.update(0.1, snapshot);
    const earlyPose = [
      visual.rig.hips.quaternion.clone(),
      visual.rig.spine.quaternion.clone(),
      visual.rig.leftLowerLeg.quaternion.clone(),
      visual.rig.rightLowerLeg.quaternion.clone(),
    ];
    expect(leftKneeBind.angleTo(visual.rig.leftLowerLeg.quaternion)).toBeGreaterThan(0.08);
    expect(rightKneeBind.angleTo(visual.rig.rightLowerLeg.quaternion)).toBeGreaterThan(0.05);
    expect(
      visual.rig.leftLowerLeg.quaternion.angleTo(visual.rig.rightLowerLeg.quaternion),
    ).toBeGreaterThan(0.015);

    animator.update(0.9, snapshot);
    const shiftedPose = [
      visual.rig.hips.quaternion.clone(),
      visual.rig.spine.quaternion.clone(),
      visual.rig.leftLowerLeg.quaternion.clone(),
      visual.rig.rightLowerLeg.quaternion.clone(),
    ];
    expect(poseDistance(earlyPose, shiftedPose)).toBeGreaterThan(0.035);
    expect(Math.abs(visual.rig.root.position.x)).toBeGreaterThan(0.008);
    expect(visual.group.position.equals(gameplayRootBefore)).toBe(true);
  });

  it('uses distinct full-body animations for projectile, area and dash skills', () => {
    const poseAt = (
      skillAnimationType: 'projectile' | 'aoe' | 'dash',
      category: 'style' | 'sword' | 'fruit',
    ): THREE.Quaternion[] => {
      const visual = createPiratePlayerVisual();
      const animator = new PlayerActionAnimator(visual.rig);
      animator.update(1 / 60, {
        combatState: 'casting',
        category,
        locomotion: 'idle',
        onGround: true,
        skillAnimationType,
        skillAnimationCategory: category,
        skillAnimationProgress: 0.52,
        skillAnimationReleaseProgress: 0.3,
        skillAnimationVariant: 0,
      });
      return [
        visual.rig.root.quaternion.clone(),
        visual.rig.hips.quaternion.clone(),
        visual.rig.spine.quaternion.clone(),
        visual.rig.leftArm.quaternion.clone(),
        visual.rig.rightArm.quaternion.clone(),
        visual.rig.leftLeg.quaternion.clone(),
        visual.rig.rightLeg.quaternion.clone(),
      ];
    };

    const projectile = poseAt('projectile', 'fruit');
    const area = poseAt('aoe', 'style');
    const dash = poseAt('dash', 'sword');
    expect(poseDistance(projectile, area)).toBeGreaterThan(1.2);
    expect(poseDistance(projectile, dash)).toBeGreaterThan(0.8);
    expect(poseDistance(area, dash)).toBeGreaterThan(1.1);
  });

  it('changes a sword skill from readable windup to forward release and recovery', () => {
    const poseAt = (skillAnimationProgress: number) => {
      const visual = createPiratePlayerVisual();
      const animator = new PlayerActionAnimator(visual.rig);
      const gameplayRootBefore = visual.group.position.clone();
      animator.update(1 / 60, {
        combatState: skillAnimationProgress < 0.35 ? 'casting' : 'idle',
        category: 'sword',
        locomotion: 'idle',
        onGround: true,
        skillAnimationType: 'projectile',
        skillAnimationCategory: 'sword',
        skillAnimationProgress,
        skillAnimationReleaseProgress: 0.35,
        skillAnimationVariant: 0,
      });
      return {
        pose: [
          visual.rig.hips.quaternion.clone(),
          visual.rig.spine.quaternion.clone(),
          visual.rig.rightArm.quaternion.clone(),
          visual.rig.rightForeArm.quaternion.clone(),
          visual.rig.leftArm.quaternion.clone(),
        ],
        visualRootZ: visual.rig.root.position.z,
        gameplayRoot: visual.group.position.clone(),
        gameplayRootBefore,
      };
    };

    const windup = poseAt(0.24);
    const release = poseAt(0.52);
    const recovery = poseAt(0.9);
    expect(poseDistance(windup.pose, release.pose)).toBeGreaterThan(1.1);
    expect(poseDistance(release.pose, recovery.pose)).toBeGreaterThan(1.1);
    expect(release.visualRootZ).toBeGreaterThan(windup.visualRootZ + 0.08);
    expect(windup.gameplayRoot.equals(windup.gameplayRootBefore)).toBe(true);
    expect(release.gameplayRoot.equals(release.gameplayRootBefore)).toBe(true);
  });

  it('uses a jab, hook, uppercut and spinning kick for the style combo', () => {
    const states = ['attack1', 'attack2', 'attack3', 'attack4'] as const;
    const poses = states.map((combatState) => {
      const visual = createPiratePlayerVisual();
      const animator = new PlayerActionAnimator(visual.rig);
      animator.update(1 / 60, {
        combatState,
        category: 'style',
        locomotion: 'idle',
        onGround: true,
        attackProgress: 0.55,
      });
      return [
        visual.rig.root.quaternion.clone(),
        visual.rig.leftArm.quaternion.clone(),
        visual.rig.rightArm.quaternion.clone(),
        visual.rig.rightLeg.quaternion.clone(),
      ];
    });

    for (let i = 0; i < poses.length; i++) {
      for (let j = i + 1; j < poses.length; j++) {
        expect(poseDistance(poses[i], poses[j])).toBeGreaterThan(0.3);
      }
    }
  });
});
