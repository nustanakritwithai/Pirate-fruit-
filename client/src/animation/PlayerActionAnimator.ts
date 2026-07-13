import * as THREE from 'three';
import type { CombatState } from '../combat/CombatState';
import type { LoadoutCategory } from '../progression/ProgressionTypes';

export interface PlayerActionSnapshot {
  combatState: CombatState;
  category: LoadoutCategory;
  onGround: boolean;
}

interface PlayerBones {
  hips: THREE.Object3D | null;
  spine: THREE.Object3D | null;
  spine2: THREE.Object3D | null;
  head: THREE.Object3D | null;
  leftArm: THREE.Object3D | null;
  leftForeArm: THREE.Object3D | null;
  rightArm: THREE.Object3D | null;
  rightForeArm: THREE.Object3D | null;
  leftLeg: THREE.Object3D | null;
  rightLeg: THREE.Object3D | null;
}

const BONE_NAMES: Record<keyof PlayerBones, string> = {
  hips: 'mixamorig:Hips',
  spine: 'mixamorig:Spine',
  spine2: 'mixamorig:Spine2',
  head: 'mixamorig:Head',
  leftArm: 'mixamorig:LeftArm',
  leftForeArm: 'mixamorig:LeftForeArm',
  rightArm: 'mixamorig:RightArm',
  rightForeArm: 'mixamorig:RightForeArm',
  leftLeg: 'mixamorig:LeftUpLeg',
  rightLeg: 'mixamorig:RightUpLeg',
};

function isAttack(state: CombatState): boolean {
  return state === 'attack1' || state === 'attack2' || state === 'attack3' || state === 'attack4';
}

/** เติม action บน Mixamo rig หลัง AnimationMixer อัปเดต locomotion แล้ว */
export class PlayerActionAnimator {
  readonly rigReady: boolean;
  private readonly bones: PlayerBones;
  private readonly euler = new THREE.Euler();
  private readonly delta = new THREE.Quaternion();
  private stateKey = '';
  private actionTime = 0;

  constructor(model: THREE.Object3D) {
    this.bones = Object.fromEntries(
      Object.entries(BONE_NAMES).map(([key, name]) => [key, model.getObjectByName(name) ?? null]),
    ) as unknown as PlayerBones;
    this.rigReady = Object.values(this.bones).filter(Boolean).length >= 8;
  }

  update(dt: number, snapshot: PlayerActionSnapshot): void {
    const key = `${snapshot.combatState}:${snapshot.category}`;
    if (key !== this.stateKey) {
      this.stateKey = key;
      this.actionTime = 0;
    } else {
      this.actionTime += dt;
    }

    if (!snapshot.onGround && snapshot.combatState !== 'dead') this.applyAirborne();

    const state = snapshot.combatState;
    if (isAttack(state)) this.applyAttack(state, snapshot.category);
    else if (state === 'casting') this.applyCasting(snapshot.category);
    else if (state === 'blocking') this.applyBlocking();
    else if (state === 'stunned') this.applyStunned();
    else if (state === 'knockback') this.applyKnockback();
    else if (state === 'knockdown') this.applyKnockdown();
    else if (state === 'dead') this.applyDeath();
  }

  private rotate(
    bone: THREE.Object3D | null,
    x: number,
    y: number,
    z: number,
  ): void {
    if (!bone) return;
    this.delta.setFromEuler(this.euler.set(x, y, z));
    bone.quaternion.multiply(this.delta);
  }

  private actionPulse(duration: number): number {
    const progress = THREE.MathUtils.clamp(this.actionTime / duration, 0, 1);
    return Math.sin(progress * Math.PI);
  }

  private applyAirborne(): void {
    this.rotate(this.bones.leftLeg, -0.34, 0, -0.08);
    this.rotate(this.bones.rightLeg, 0.42, 0, 0.08);
    this.rotate(this.bones.leftArm, -0.22, 0, -0.18);
    this.rotate(this.bones.rightArm, -0.22, 0, 0.18);
    this.rotate(this.bones.spine, -0.08, 0, 0);
  }

  private applyAttack(state: CombatState, category: LoadoutCategory): void {
    const pulse = this.actionPulse(state === 'attack4' ? 0.58 : 0.4);
    const finisher = state === 'attack4' ? 1.35 : 1;
    const leftHit = state === 'attack2';

    if (category === 'gun') {
      this.rotate(this.bones.spine2, -0.12 * pulse, 0.2 * pulse, 0);
      this.rotate(this.bones.rightArm, -1.25 * pulse, -0.16 * pulse, -0.2 * pulse);
      this.rotate(this.bones.rightForeArm, -0.72 * pulse, 0, 0);
      this.rotate(this.bones.leftArm, -1.02 * pulse, 0.18 * pulse, 0.28 * pulse);
      this.rotate(this.bones.leftForeArm, -0.62 * pulse, 0, 0);
      return;
    }

    if (category === 'sword') {
      this.rotate(this.bones.spine2, -0.16 * pulse, 0.5 * pulse * finisher, 0.08 * pulse);
      this.rotate(this.bones.rightArm, -1.45 * pulse * finisher, -0.22 * pulse, -0.82 * pulse);
      this.rotate(this.bones.rightForeArm, -0.42 * pulse, 0, 0);
      this.rotate(this.bones.leftArm, -0.35 * pulse, 0, 0.18 * pulse);
      return;
    }

    const strikingArm = leftHit ? this.bones.leftArm : this.bones.rightArm;
    const strikingForearm = leftHit ? this.bones.leftForeArm : this.bones.rightForeArm;
    const guardArm = leftHit ? this.bones.rightArm : this.bones.leftArm;
    this.rotate(this.bones.spine2, -0.12 * pulse, (leftHit ? -1 : 1) * 0.32 * pulse, 0);
    this.rotate(strikingArm, -1.55 * pulse * finisher, 0, (leftHit ? 1 : -1) * 0.34 * pulse);
    this.rotate(strikingForearm, -0.68 * pulse, 0, 0);
    this.rotate(guardArm, -0.48 * pulse, 0, (leftHit ? -1 : 1) * 0.18 * pulse);
  }

  private applyCasting(category: LoadoutCategory): void {
    const charge = THREE.MathUtils.smoothstep(this.actionTime, 0, 0.28);
    const spread = category === 'fruit' ? 0.42 : 0.22;
    this.rotate(this.bones.spine2, -0.14 * charge, 0, 0);
    this.rotate(this.bones.leftArm, -1.18 * charge, 0, spread * charge);
    this.rotate(this.bones.rightArm, -1.18 * charge, 0, -spread * charge);
    this.rotate(this.bones.leftForeArm, -0.48 * charge, 0, 0);
    this.rotate(this.bones.rightForeArm, -0.48 * charge, 0, 0);
    this.rotate(this.bones.head, -0.12 * charge, 0, 0);
  }

  private applyBlocking(): void {
    this.rotate(this.bones.spine2, -0.12, 0, 0);
    this.rotate(this.bones.leftArm, -1.12, 0.2, 0.5);
    this.rotate(this.bones.rightArm, -1.12, -0.2, -0.5);
    this.rotate(this.bones.leftForeArm, -0.88, 0, 0);
    this.rotate(this.bones.rightForeArm, -0.88, 0, 0);
  }

  private applyStunned(): void {
    const sway = Math.sin(this.actionTime * 13) * 0.18;
    this.rotate(this.bones.spine, 0.18, 0, sway);
    this.rotate(this.bones.head, 0.12, -sway, 0);
    this.rotate(this.bones.leftArm, 0.32, 0, -0.2);
    this.rotate(this.bones.rightArm, 0.32, 0, 0.2);
  }

  private applyKnockback(): void {
    const amount = this.actionPulse(0.36);
    this.rotate(this.bones.hips, 0.3 * amount, 0, 0);
    this.rotate(this.bones.spine, 0.5 * amount, 0, 0);
    this.rotate(this.bones.leftArm, 0.72 * amount, 0, -0.32 * amount);
    this.rotate(this.bones.rightArm, 0.72 * amount, 0, 0.32 * amount);
  }

  private applyKnockdown(): void {
    const amount = THREE.MathUtils.smoothstep(this.actionTime, 0, 0.26);
    this.rotate(this.bones.hips, 0, 0, -1.18 * amount);
    this.rotate(this.bones.spine, 0.34 * amount, 0, 0);
    this.rotate(this.bones.leftArm, 0.62 * amount, 0, 0);
    this.rotate(this.bones.rightArm, 0.62 * amount, 0, 0);
  }

  private applyDeath(): void {
    const amount = THREE.MathUtils.smoothstep(this.actionTime, 0, 0.55);
    this.rotate(this.bones.hips, 0, 0, -1.42 * amount);
    this.rotate(this.bones.spine, 0.42 * amount, 0, 0);
    this.rotate(this.bones.head, 0.28 * amount, 0, 0);
    this.rotate(this.bones.leftArm, 0.82 * amount, 0, -0.2 * amount);
    this.rotate(this.bones.rightArm, 0.82 * amount, 0, 0.2 * amount);
  }
}
