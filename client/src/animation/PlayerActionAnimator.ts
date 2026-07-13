import * as THREE from 'three';
import type { PiratePlayerRig } from '../art/CharacterRig';
import type { CombatState } from '../combat/CombatState';
import type { LoadoutCategory } from '../progression/ProgressionTypes';

export type PlayerLocomotion = 'idle' | 'walk' | 'run' | 'swim';

export interface PlayerActionSnapshot {
  combatState: CombatState;
  category: LoadoutCategory;
  locomotion: PlayerLocomotion;
  onGround: boolean;
}

interface BindPose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}

function isAttack(state: CombatState): boolean {
  return state === 'attack1' || state === 'attack2' || state === 'attack3' || state === 'attack4';
}

/**
 * Animator ของ Pirate V1: คืนทุก pivot สู่ bind pose ก่อนวาด locomotion/action ในเฟรมใหม่
 * จึงไม่มี quaternion drift และ palm socket ตามมือแบบ deterministic ทุกท่า
 */
export class PlayerActionAnimator {
  readonly rigReady = true;
  private readonly nodes: THREE.Object3D[];
  private readonly bindPoses = new Map<THREE.Object3D, BindPose>();
  private readonly euler = new THREE.Euler();
  private readonly delta = new THREE.Quaternion();
  private stateKey = '';
  private elapsed = 0;
  private actionTime = 0;

  constructor(private readonly rig: PiratePlayerRig) {
    this.nodes = [
      rig.root,
      rig.hips,
      rig.spine,
      rig.chest,
      rig.head,
      rig.leftArm,
      rig.leftForeArm,
      rig.leftHand,
      rig.rightArm,
      rig.rightForeArm,
      rig.rightHand,
      rig.leftLeg,
      rig.leftLowerLeg,
      rig.leftFoot,
      rig.rightLeg,
      rig.rightLowerLeg,
      rig.rightFoot,
    ];
    for (const node of this.nodes) {
      this.bindPoses.set(node, {
        position: node.position.clone(),
        quaternion: node.quaternion.clone(),
        scale: node.scale.clone(),
      });
    }
  }

  update(dt: number, snapshot: PlayerActionSnapshot): void {
    this.elapsed += dt;
    const key = `${snapshot.combatState}:${snapshot.category}`;
    if (key !== this.stateKey) {
      this.stateKey = key;
      this.actionTime = 0;
    } else {
      this.actionTime += dt;
    }

    this.restoreBindPose();
    this.applyLocomotion(snapshot.locomotion);
    if (!snapshot.onGround && snapshot.locomotion !== 'swim' && snapshot.combatState !== 'dead') {
      this.applyAirborne();
    }

    const state = snapshot.combatState;
    if (isAttack(state)) this.applyAttack(state, snapshot.category);
    else if (state === 'casting') this.applyCasting(snapshot.category);
    else if (state === 'blocking') this.applyBlocking();
    else if (state === 'stunned') this.applyStunned();
    else if (state === 'knockback') this.applyKnockback();
    else if (state === 'knockdown') this.applyKnockdown();
    else if (state === 'dead') this.applyDeath();
  }

  private restoreBindPose(): void {
    for (const node of this.nodes) {
      const pose = this.bindPoses.get(node)!;
      node.position.copy(pose.position);
      node.quaternion.copy(pose.quaternion);
      node.scale.copy(pose.scale);
    }
  }

  private rotate(node: THREE.Object3D, x: number, y: number, z: number): void {
    this.delta.setFromEuler(this.euler.set(x, y, z));
    node.quaternion.multiply(this.delta);
  }

  private actionPulse(duration: number): number {
    const progress = THREE.MathUtils.clamp(this.actionTime / duration, 0, 1);
    return Math.sin(progress * Math.PI);
  }

  private applyLocomotion(locomotion: PlayerLocomotion): void {
    const breath = Math.sin(this.elapsed * 2.2);
    this.rig.root.position.y += breath * 0.012;
    this.rig.chest.scale.y *= 1 + breath * 0.006;
    this.rotate(this.rig.head, 0, Math.sin(this.elapsed * 0.62) * 0.035, 0);

    if (locomotion === 'idle') {
      this.rotate(this.rig.leftArm, breath * 0.018, 0, 0);
      this.rotate(this.rig.rightArm, -breath * 0.018, 0, 0);
      return;
    }

    if (locomotion === 'swim') {
      const stroke = Math.sin(this.elapsed * 5.2);
      this.rotate(this.rig.spine, -0.42, 0, stroke * 0.04);
      this.rotate(this.rig.leftArm, -1.15 + stroke * 0.55, 0, 0.42);
      this.rotate(this.rig.rightArm, -1.15 - stroke * 0.55, 0, -0.42);
      this.rotate(this.rig.leftForeArm, -0.5, 0, 0);
      this.rotate(this.rig.rightForeArm, -0.5, 0, 0);
      this.rotate(this.rig.leftLeg, -stroke * 0.22, 0, 0);
      this.rotate(this.rig.rightLeg, stroke * 0.22, 0, 0);
      return;
    }

    const running = locomotion === 'run';
    const frequency = running ? 10.4 : 6.4;
    const stride = running ? 0.74 : 0.43;
    const cycle = Math.sin(this.elapsed * frequency);
    const leftKneeBend = Math.max(0, -cycle) * (running ? 0.72 : 0.35);
    const rightKneeBend = Math.max(0, cycle) * (running ? 0.72 : 0.35);
    this.rotate(this.rig.leftLeg, cycle * stride, 0, 0);
    this.rotate(this.rig.rightLeg, -cycle * stride, 0, 0);
    this.rotate(this.rig.leftLowerLeg, leftKneeBend, 0, 0);
    this.rotate(this.rig.rightLowerLeg, rightKneeBend, 0, 0);
    this.rotate(this.rig.leftArm, -cycle * stride * 0.72, 0, 0.05);
    this.rotate(this.rig.rightArm, cycle * stride * 0.72, 0, -0.05);
    this.rotate(this.rig.leftForeArm, -0.16 - Math.max(0, cycle) * 0.24, 0, 0);
    this.rotate(this.rig.rightForeArm, -0.16 - Math.max(0, -cycle) * 0.24, 0, 0);
    this.rotate(this.rig.spine, running ? -0.12 : -0.035, 0, cycle * 0.025);
    this.rig.root.position.y += Math.abs(Math.cos(this.elapsed * frequency)) * (running ? 0.052 : 0.025);
  }

  private applyAirborne(): void {
    this.rotate(this.rig.leftLeg, -0.3, 0, -0.06);
    this.rotate(this.rig.rightLeg, 0.38, 0, 0.06);
    this.rotate(this.rig.leftLowerLeg, 0.38, 0, 0);
    this.rotate(this.rig.rightLowerLeg, 0.16, 0, 0);
    this.rotate(this.rig.leftArm, -0.28, 0, -0.2);
    this.rotate(this.rig.rightArm, -0.28, 0, 0.2);
    this.rotate(this.rig.spine, -0.07, 0, 0);
  }

  private applyAttack(state: CombatState, category: LoadoutCategory): void {
    const pulse = this.actionPulse(state === 'attack4' ? 0.58 : 0.4);
    const finisher = state === 'attack4' ? 1.32 : 1;
    const leftHit = state === 'attack2';

    if (category === 'gun') {
      this.rotate(this.rig.spine, -0.1 * pulse, 0.18 * pulse, 0);
      this.rotate(this.rig.rightArm, -1.34 * pulse, -0.12 * pulse, -0.18 * pulse);
      this.rotate(this.rig.rightForeArm, -0.58 * pulse, 0, 0);
      this.rotate(this.rig.leftArm, -1.08 * pulse, 0.16 * pulse, 0.28 * pulse);
      this.rotate(this.rig.leftForeArm, -0.64 * pulse, 0, 0);
      return;
    }

    if (category === 'sword') {
      const side = state === 'attack2' ? -1 : 1;
      this.rotate(this.rig.hips, 0, side * 0.22 * pulse, 0);
      this.rotate(this.rig.spine, -0.14 * pulse, side * 0.48 * pulse * finisher, 0.07 * pulse);
      this.rotate(this.rig.rightArm, -1.42 * pulse * finisher, -0.2 * pulse, -0.78 * pulse * side);
      this.rotate(this.rig.rightForeArm, -0.48 * pulse, 0, -0.12 * pulse * side);
      this.rotate(this.rig.rightHand, 0, 0, -0.18 * pulse * side);
      this.rotate(this.rig.leftArm, -0.36 * pulse, 0, 0.18 * pulse);
      return;
    }

    const strikingArm = leftHit ? this.rig.leftArm : this.rig.rightArm;
    const strikingForearm = leftHit ? this.rig.leftForeArm : this.rig.rightForeArm;
    const guardArm = leftHit ? this.rig.rightArm : this.rig.leftArm;
    this.rotate(this.rig.spine, -0.11 * pulse, (leftHit ? -1 : 1) * 0.3 * pulse, 0);
    this.rotate(strikingArm, -1.5 * pulse * finisher, 0, (leftHit ? 1 : -1) * 0.34 * pulse);
    this.rotate(strikingForearm, -0.64 * pulse, 0, 0);
    this.rotate(guardArm, -0.46 * pulse, 0, (leftHit ? -1 : 1) * 0.18 * pulse);
  }

  private applyCasting(category: LoadoutCategory): void {
    const charge = THREE.MathUtils.smoothstep(this.actionTime, 0, 0.28);
    const spread = category === 'fruit' ? 0.44 : 0.24;
    this.rotate(this.rig.spine, -0.12 * charge, 0, 0);
    this.rotate(this.rig.leftArm, -1.16 * charge, 0, spread * charge);
    this.rotate(this.rig.rightArm, -1.16 * charge, 0, -spread * charge);
    this.rotate(this.rig.leftForeArm, -0.46 * charge, 0, 0);
    this.rotate(this.rig.rightForeArm, -0.46 * charge, 0, 0);
    this.rotate(this.rig.head, -0.1 * charge, 0, 0);
  }

  private applyBlocking(): void {
    this.rotate(this.rig.spine, -0.11, 0, 0);
    this.rotate(this.rig.leftArm, -1.08, 0.2, 0.48);
    this.rotate(this.rig.rightArm, -1.08, -0.2, -0.48);
    this.rotate(this.rig.leftForeArm, -0.82, 0, 0);
    this.rotate(this.rig.rightForeArm, -0.82, 0, 0);
  }

  private applyStunned(): void {
    const sway = Math.sin(this.actionTime * 13) * 0.17;
    this.rotate(this.rig.spine, 0.17, 0, sway);
    this.rotate(this.rig.head, 0.11, -sway, 0);
    this.rotate(this.rig.leftArm, 0.3, 0, -0.2);
    this.rotate(this.rig.rightArm, 0.3, 0, 0.2);
  }

  private applyKnockback(): void {
    const amount = this.actionPulse(0.36);
    this.rotate(this.rig.hips, 0.28 * amount, 0, 0);
    this.rotate(this.rig.spine, 0.48 * amount, 0, 0);
    this.rotate(this.rig.leftArm, 0.7 * amount, 0, -0.3 * amount);
    this.rotate(this.rig.rightArm, 0.7 * amount, 0, 0.3 * amount);
  }

  private applyKnockdown(): void {
    const amount = THREE.MathUtils.smoothstep(this.actionTime, 0, 0.26);
    this.rotate(this.rig.root, 0, 0, -1.16 * amount);
    this.rotate(this.rig.spine, 0.32 * amount, 0, 0);
    this.rotate(this.rig.leftArm, 0.6 * amount, 0, 0);
    this.rotate(this.rig.rightArm, 0.6 * amount, 0, 0);
  }

  private applyDeath(): void {
    const amount = THREE.MathUtils.smoothstep(this.actionTime, 0, 0.55);
    this.rotate(this.rig.root, 0, 0, -1.42 * amount);
    this.rig.root.position.y -= 0.32 * amount;
    this.rotate(this.rig.spine, 0.4 * amount, 0, 0);
    this.rotate(this.rig.head, 0.26 * amount, 0, 0);
    this.rotate(this.rig.leftArm, 0.8 * amount, 0, -0.2 * amount);
    this.rotate(this.rig.rightArm, 0.8 * amount, 0, 0.2 * amount);
  }
}
