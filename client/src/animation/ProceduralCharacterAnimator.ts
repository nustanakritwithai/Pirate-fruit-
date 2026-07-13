import * as THREE from 'three';
import type { CharacterRig } from '../art/CharacterRig';

export type ProceduralLoopAction = 'idle' | 'walk' | 'run' | 'talk' | 'heavy';

interface Pose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}

function smooth01(value: number): number {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Animator เบาสำหรับ NPC/Monster procedural
 * ขยับเฉพาะ pivot 7 จุด ไม่สร้าง keyframe/geometry/material ระหว่างเฟรม
 */
export class ProceduralCharacterAnimator {
  private readonly nodes: THREE.Object3D[];
  private readonly poses = new Map<THREE.Object3D, Pose>();
  private readonly delta = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private elapsed = 0;
  private actionTime = 0;
  private currentAction: ProceduralLoopAction = 'idle';
  private hitTimer = 0;
  private attackTimer = 0;
  private attackDuration = 0.4;
  private heavyAttack = false;

  constructor(private readonly rig: CharacterRig, private readonly phaseOffset = 0) {
    this.nodes = [
      rig.root,
      rig.body,
      rig.head,
      rig.leftArm,
      rig.rightArm,
      rig.leftLeg,
      rig.rightLeg,
    ];
    for (const node of this.nodes) {
      this.poses.set(node, {
        position: node.position.clone(),
        quaternion: node.quaternion.clone(),
        scale: node.scale.clone(),
      });
    }
  }

  triggerAttack(heavy = false): void {
    this.heavyAttack = heavy;
    this.attackDuration = heavy ? 0.62 : 0.4;
    this.attackTimer = this.attackDuration;
  }

  triggerHit(): void {
    this.hitTimer = 0.26;
  }

  reset(): void {
    this.elapsed = 0;
    this.actionTime = 0;
    this.currentAction = 'idle';
    this.hitTimer = 0;
    this.attackTimer = 0;
    this.restorePose();
  }

  update(dt: number, action: ProceduralLoopAction, deathProgress = 0): void {
    this.elapsed += dt;
    if (action !== this.currentAction) {
      this.currentAction = action;
      this.actionTime = 0;
    } else {
      this.actionTime += dt;
    }
    this.hitTimer = Math.max(0, this.hitTimer - dt);
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.restorePose();

    if (deathProgress > 0) {
      this.applyDeath(smooth01(deathProgress));
      return;
    }

    if (this.rig.kind === 'crab') this.applyCrab(action);
    else this.applyHumanoid(action);

    if (this.hitTimer > 0) this.applyHit(this.hitTimer / 0.26);
    if (this.attackTimer > 0) {
      const progress = 1 - this.attackTimer / this.attackDuration;
      this.applyAttack(Math.sin(progress * Math.PI), this.heavyAttack);
    }
  }

  private restorePose(): void {
    for (const node of this.nodes) {
      const pose = this.poses.get(node)!;
      node.position.copy(pose.position);
      node.quaternion.copy(pose.quaternion);
      node.scale.copy(pose.scale);
    }
  }

  private rotate(node: THREE.Object3D, x: number, y: number, z: number): void {
    this.delta.setFromEuler(this.euler.set(x, y, z));
    node.quaternion.multiply(this.delta);
  }

  private applyHumanoid(action: ProceduralLoopAction): void {
    const idle = Math.sin(this.elapsed * 2.1 + this.phaseOffset);
    this.rig.root.position.y += idle * 0.018;
    this.rig.body.scale.y *= 1 + idle * 0.008;
    this.rotate(this.rig.head, 0, Math.sin(this.elapsed * 0.7 + this.phaseOffset) * 0.08, 0);

    if (action === 'walk' || action === 'run') {
      const speed = action === 'run' ? 9.2 : 5.8;
      const strength = action === 'run' ? 0.72 : 0.42;
      const cycle = Math.sin(this.elapsed * speed + this.phaseOffset);
      const lift = Math.abs(Math.cos(this.elapsed * speed + this.phaseOffset));
      this.rotate(this.rig.leftLeg, cycle * strength, 0, 0);
      this.rotate(this.rig.rightLeg, -cycle * strength, 0, 0);
      this.rotate(this.rig.leftArm, -cycle * strength * 0.72, 0, 0);
      this.rotate(this.rig.rightArm, cycle * strength * 0.72, 0, 0);
      this.rig.root.position.y += lift * (action === 'run' ? 0.07 : 0.035);
      this.rotate(this.rig.body, action === 'run' ? -0.12 : -0.035, 0, cycle * 0.025);
    } else if (action === 'talk') {
      const wave = Math.sin(this.elapsed * 4.8 + this.phaseOffset) * 0.22;
      this.rotate(this.rig.rightArm, -1.55 + wave, 0.08, -0.42);
      this.rotate(this.rig.leftArm, -0.25, 0, 0.08);
      this.rotate(this.rig.head, -0.04, wave * 0.18, 0);
    } else if (action === 'heavy') {
      const charge = smooth01(this.actionTime / 0.55);
      this.rotate(this.rig.body, 0.18 * charge, -0.24 * charge, 0);
      this.rotate(this.rig.rightArm, 1.55 * charge, 0, -0.62 * charge);
      this.rotate(this.rig.leftArm, 0.72 * charge, 0, 0.3 * charge);
      this.rig.root.position.y -= 0.09 * charge;
    } else {
      this.rotate(this.rig.leftArm, idle * 0.025, 0, 0);
      this.rotate(this.rig.rightArm, -idle * 0.025, 0, 0);
    }
  }

  private applyCrab(action: ProceduralLoopAction): void {
    const idle = Math.sin(this.elapsed * 2.8 + this.phaseOffset);
    this.rig.root.position.y += idle * 0.022;
    this.rotate(this.rig.leftArm, 0, 0, idle * 0.08);
    this.rotate(this.rig.rightArm, 0, 0, -idle * 0.08);

    if (action === 'walk' || action === 'run') {
      const speed = action === 'run' ? 12 : 8;
      const cycle = Math.sin(this.elapsed * speed + this.phaseOffset);
      this.rig.root.position.y += Math.abs(cycle) * 0.045;
      this.rig.root.position.x += cycle * 0.035;
      this.rotate(this.rig.leftLeg, cycle * 0.38, 0, cycle * 0.18);
      this.rotate(this.rig.rightLeg, -cycle * 0.38, 0, -cycle * 0.18);
      this.rotate(this.rig.body, 0, cycle * 0.06, -cycle * 0.035);
    } else if (action === 'heavy') {
      const charge = smooth01(this.actionTime / 0.55);
      this.rotate(this.rig.leftArm, -0.5 * charge, 0, -0.82 * charge);
      this.rotate(this.rig.rightArm, -0.5 * charge, 0, 0.82 * charge);
      this.rig.body.scale.y *= 1 - charge * 0.16;
      this.rig.body.scale.x *= 1 + charge * 0.08;
    }
  }

  private applyAttack(pulse: number, heavy: boolean): void {
    if (this.rig.kind === 'crab') {
      const amount = pulse * (heavy ? 1.18 : 0.82);
      this.rotate(this.rig.leftArm, -amount, 0, amount * 0.45);
      this.rotate(this.rig.rightArm, -amount, 0, -amount * 0.45);
      this.rig.root.position.z += pulse * (heavy ? 0.34 : 0.2);
      return;
    }

    const amount = pulse * (heavy ? 1.35 : 1);
    this.rotate(this.rig.body, -amount * 0.2, amount * 0.3, 0);
    this.rotate(this.rig.rightArm, -amount * 1.65, -amount * 0.15, -amount * 0.58);
    this.rotate(this.rig.leftArm, -amount * 0.38, 0, amount * 0.18);
    this.rig.root.position.z += pulse * (heavy ? 0.32 : 0.2);
  }

  private applyHit(fraction: number): void {
    const recoil = Math.sin((1 - fraction) * Math.PI) * fraction;
    this.rotate(this.rig.body, recoil * 0.34, 0, recoil * 0.2);
    this.rotate(this.rig.head, recoil * 0.18, -recoil * 0.24, 0);
    this.rig.root.position.z -= recoil * 0.16;
  }

  private applyDeath(progress: number): void {
    if (this.rig.kind === 'crab') {
      this.rotate(this.rig.root, progress * Math.PI * 0.82, 0, progress * 0.35);
      this.rig.root.position.y -= progress * 0.28;
    } else {
      this.rotate(this.rig.root, 0, 0, -progress * Math.PI * 0.48);
      this.rig.root.position.y -= progress * 0.42;
      this.rotate(this.rig.leftArm, progress * 0.8, 0, 0);
      this.rotate(this.rig.rightArm, progress * 0.8, 0, 0);
    }
    const shrink = THREE.MathUtils.lerp(1, 0.72, progress);
    this.rig.root.scale.multiplyScalar(shrink);
  }
}
