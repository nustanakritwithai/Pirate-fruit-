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
  /** 0..1 จาก Combat Core ใช้ sync visual เท่านั้น; ไม่มีผลต่อ hitbox/timing */
  attackProgress?: number;
}

interface BindPose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}

interface AttackMotion {
  progress: number;
  windup: number;
  strike: number;
  accent: number;
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
    if (state === 'idle') this.applyReadyStance(snapshot.category, snapshot.locomotion);
    if (isAttack(state)) this.applyAttack(state, snapshot.category, snapshot.attackProgress);
    else if (state === 'casting') this.applyCasting(snapshot.category);
    else if (state === 'blocking') this.applyBlocking(snapshot.category);
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

  private attackMotion(
    state: CombatState,
    category: LoadoutCategory,
    syncedProgress?: number,
  ): AttackMotion {
    const comboIndex = state === 'attack2' ? 1 : state === 'attack3' ? 2 : state === 'attack4' ? 3 : 0;
    const fallbackDurations = category === 'sword'
      ? [0.52, 0.52, 0.58, 0.89]
      : category === 'style'
        ? [0.4, 0.4, 0.46, 0.73]
        : [0.44, 0.46, 0.5, 0.68];
    const fallbackProgress = this.actionTime / fallbackDurations[comboIndex];
    const progress = THREE.MathUtils.clamp(
      Number.isFinite(syncedProgress) ? syncedProgress! : fallbackProgress,
      0,
      1,
    );
    const windup = THREE.MathUtils.smoothstep(progress, 0, 0.2) *
      (1 - THREE.MathUtils.smoothstep(progress, 0.24, 0.42));
    const strike = THREE.MathUtils.smoothstep(progress, 0.2, 0.38) *
      (1 - THREE.MathUtils.smoothstep(progress, 0.7, 1));
    const accentProgress = THREE.MathUtils.clamp((progress - 0.14) / 0.72, 0, 1);
    const accent = Math.sin(accentProgress * Math.PI);
    return { progress, windup, strike, accent };
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

  /** ท่าพร้อมรบแยกตามอาวุธ ทำให้ silhouette อ่านง่ายก่อนเริ่มโจมตี */
  private applyReadyStance(category: LoadoutCategory, locomotion: PlayerLocomotion): void {
    if (locomotion !== 'idle') return;
    const sway = Math.sin(this.elapsed * 2.8) * 0.025;
    if (category === 'sword') {
      this.rotate(this.rig.hips, 0, -0.08, 0);
      this.rotate(this.rig.spine, -0.035, -0.1, 0);
      this.rotate(this.rig.rightArm, -0.28 + sway, -0.08, 0.3);
      this.rotate(this.rig.rightForeArm, -0.3, 0, 0.06);
      this.rotate(this.rig.rightHand, 0.04, 0, 0.08);
      this.rotate(this.rig.leftArm, -0.4 - sway, 0.08, -0.18);
      this.rotate(this.rig.leftForeArm, -0.58, 0, 0);
      return;
    }
    if (category === 'gun') {
      this.rotate(this.rig.spine, -0.06, 0.12, 0);
      this.rotate(this.rig.rightArm, -0.72 + sway, -0.08, -0.12);
      this.rotate(this.rig.rightForeArm, -0.42, 0, 0);
      this.rotate(this.rig.leftArm, -0.56 - sway, 0.12, 0.22);
      this.rotate(this.rig.leftForeArm, -0.64, 0, 0);
      return;
    }
    if (category === 'fruit') {
      this.rotate(this.rig.leftArm, -0.58 + sway, 0, -0.2);
      this.rotate(this.rig.leftForeArm, -0.52, 0, 0);
      this.rotate(this.rig.rightArm, -0.3 - sway, 0, 0.18);
      return;
    }
    if (category === 'style') {
      this.rotate(this.rig.spine, -0.05, 0, 0);
      this.rotate(this.rig.leftArm, -0.5 + sway, 0.05, -0.2);
      this.rotate(this.rig.rightArm, -0.5 - sway, -0.05, 0.2);
      this.rotate(this.rig.leftForeArm, -0.72, 0, 0);
      this.rotate(this.rig.rightForeArm, -0.72, 0, 0);
    }
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

  private applyAttack(
    state: CombatState,
    category: LoadoutCategory,
    syncedProgress?: number,
  ): void {
    const motion = this.attackMotion(state, category, syncedProgress);
    this.applyReadyStance(category, 'idle');
    if (category === 'sword') this.applySwordCombo(state, motion);
    else if (category === 'gun') this.applyGunCombo(state, motion);
    else if (category === 'fruit') this.applyFruitCombo(state, motion);
    else this.applyStyleCombo(state, motion);
  }

  /** ดาบ 4 จังหวะ: ฟันเฉียง → ฟันย้อน → ฟันเสย → หมุนปิดคอมโบ */
  private applySwordCombo(state: CombatState, motion: AttackMotion): void {
    const { progress, windup: w, strike: s, accent: a } = motion;
    if (state === 'attack1') {
      this.rotate(this.rig.hips, 0, -0.24 * w + 0.3 * s, 0);
      this.rotate(this.rig.spine, -0.08 * a, -0.5 * w + 0.64 * s, 0.12 * w - 0.08 * s);
      this.rotate(this.rig.rightArm, -0.7 * w - 1.08 * s, -0.24 * w + 0.2 * s, 0.64 * w - 0.94 * s);
      this.rotate(this.rig.rightForeArm, -0.25 * w - 0.48 * s, 0, 0.08 * w - 0.16 * s);
      this.rotate(this.rig.rightHand, 0, 0, 0.18 * w - 0.28 * s);
      this.rotate(this.rig.leftArm, -0.32 * a, 0, -0.2 * a);
      this.rig.root.position.z += 0.15 * a;
      return;
    }
    if (state === 'attack2') {
      this.rotate(this.rig.hips, 0, 0.3 * w - 0.42 * s, 0);
      this.rotate(this.rig.spine, -0.1 * a, 0.58 * w - 0.76 * s, -0.1 * w + 0.12 * s);
      this.rotate(this.rig.rightArm, -0.92 * w - 0.78 * s, 0.28 * w - 0.34 * s, -0.62 * w + 1.02 * s);
      this.rotate(this.rig.rightForeArm, -0.34 * w - 0.36 * s, 0, -0.1 * w + 0.18 * s);
      this.rotate(this.rig.rightHand, 0, 0, -0.2 * w + 0.32 * s);
      this.rotate(this.rig.leftArm, -0.42 * a, 0, 0.22 * a);
      this.rig.root.position.z += 0.13 * a;
      return;
    }
    if (state === 'attack3') {
      this.rig.root.position.y += -0.08 * w + 0.05 * s;
      this.rig.root.position.z += 0.18 * a;
      this.rotate(this.rig.hips, 0.2 * w - 0.18 * s, -0.18 * w + 0.28 * s, 0);
      this.rotate(this.rig.spine, 0.22 * w - 0.3 * s, -0.28 * w + 0.34 * s, -0.08 * w);
      this.rotate(this.rig.rightArm, 0.42 * w - 1.62 * s, -0.2 * w, 0.46 * w - 0.38 * s);
      this.rotate(this.rig.rightForeArm, 0.2 * w - 0.62 * s, 0, 0.12 * s);
      this.rotate(this.rig.rightHand, -0.12 * w, 0, -0.3 * s);
      this.rotate(this.rig.leftLeg, -0.2 * w, 0, 0);
      this.rotate(this.rig.rightLowerLeg, 0.34 * w, 0, 0);
      return;
    }

    const spin = THREE.MathUtils.smoothstep(progress, 0.1, 0.72);
    this.rotate(this.rig.root, 0, spin * Math.PI * 2, 0);
    this.rig.root.position.y -= a * 0.08;
    this.rig.root.position.z += a * 0.24;
    this.rotate(this.rig.hips, -0.12 * w, -0.5 * w + 0.42 * s, 0);
    this.rotate(this.rig.spine, -0.16 * a, -0.64 * w + 0.88 * s, 0.12 * a);
    this.rotate(this.rig.rightArm, -0.8 * w - 1.3 * s, -0.28 * w, 0.72 * w - 1.08 * s);
    this.rotate(this.rig.rightForeArm, -0.28 * w - 0.58 * s, 0, -0.24 * s);
    this.rotate(this.rig.leftArm, -0.68 * a, 0, 0.48 * a);
    this.rotate(this.rig.leftLeg, 0.26 * a, 0, -0.12 * a);
    this.rotate(this.rig.rightLeg, -0.34 * a, 0, 0.12 * a);
  }

  /** หมัด 4 จังหวะ: jab → left hook → uppercut → spinning kick */
  private applyStyleCombo(state: CombatState, motion: AttackMotion): void {
    const { progress, windup: w, strike: s, accent: a } = motion;
    if (state === 'attack1') {
      this.rotate(this.rig.spine, -0.1 * a, -0.24 * w + 0.32 * s, 0);
      this.rotate(this.rig.rightArm, -0.38 * w - 1.42 * s, 0, 0.26 * w - 0.32 * s);
      this.rotate(this.rig.rightForeArm, -0.82 * w + 0.54 * s, 0, 0);
      this.rotate(this.rig.leftArm, -0.2 * a, 0, -0.15 * a);
      this.rig.root.position.z += 0.14 * a;
      return;
    }
    if (state === 'attack2') {
      this.rotate(this.rig.hips, 0, 0.3 * w - 0.36 * s, 0);
      this.rotate(this.rig.spine, -0.08 * a, 0.44 * w - 0.56 * s, -0.08 * a);
      this.rotate(this.rig.leftArm, -0.62 * w - 1.02 * s, 0.42 * w - 0.52 * s, -0.5 * w + 0.92 * s);
      this.rotate(this.rig.leftForeArm, -0.74 * w - 0.22 * s, 0, 0.25 * s);
      this.rotate(this.rig.rightArm, -0.3 * a, 0, 0.18 * a);
      this.rig.root.position.z += 0.12 * a;
      return;
    }
    if (state === 'attack3') {
      this.rig.root.position.y -= 0.07 * w;
      this.rotate(this.rig.hips, 0.2 * w, -0.18 * w + 0.26 * s, 0);
      this.rotate(this.rig.spine, 0.22 * w - 0.28 * s, -0.2 * w + 0.3 * s, 0.1 * s);
      this.rotate(this.rig.rightArm, 0.38 * w - 1.2 * s, 0, 0.42 * w - 0.48 * s);
      this.rotate(this.rig.rightForeArm, -0.9 * w - 0.36 * s, 0, 0);
      this.rotate(this.rig.leftArm, -0.5 * a, 0, -0.2 * a);
      this.rig.root.position.z += 0.17 * a;
      return;
    }

    const spin = THREE.MathUtils.smoothstep(progress, 0.12, 0.7);
    this.rotate(this.rig.root, 0, spin * Math.PI * 2, 0);
    this.rig.root.position.y += a * 0.06;
    this.rig.root.position.z += a * 0.2;
    this.rotate(this.rig.spine, -0.18 * a, 0.34 * s, 0.18 * a);
    this.rotate(this.rig.leftArm, -0.72 * a, 0, -0.5 * a);
    this.rotate(this.rig.rightArm, -0.72 * a, 0, 0.5 * a);
    this.rotate(this.rig.rightLeg, 0.28 * w - 1.38 * s, 0, 0.48 * s);
    this.rotate(this.rig.rightLowerLeg, 0.52 * w - 0.2 * s, 0, 0);
    this.rotate(this.rig.leftLeg, -0.24 * a, 0, -0.1 * a);
  }

  private applyGunCombo(state: CombatState, motion: AttackMotion): void {
    const { strike: s, accent: recoil } = motion;
    const side = state === 'attack2' ? -1 : 1;
    this.rotate(this.rig.hips, 0, side * 0.08 * recoil, 0);
    this.rotate(this.rig.spine, -0.12 * s + 0.12 * recoil, side * 0.14 * s, 0);
    this.rotate(this.rig.rightArm, -0.68 * s + 0.22 * recoil, -0.08 * s, -0.08 * s);
    this.rotate(this.rig.rightForeArm, -0.42 * s + 0.16 * recoil, 0, 0);
    this.rotate(this.rig.leftArm, -0.58 * s, 0.12 * s, 0.2 * s);
    this.rotate(this.rig.leftForeArm, -0.66 * s, 0, 0);
    this.rotate(this.rig.head, 0.04 * recoil, side * -0.05 * recoil, 0);
    this.rig.root.position.z -= recoil * (state === 'attack4' ? 0.1 : 0.055);
  }

  private applyFruitCombo(state: CombatState, motion: AttackMotion): void {
    const { progress, windup: w, strike: s, accent: a } = motion;
    const leftLead = state === 'attack2';
    const leadArm = leftLead ? this.rig.leftArm : this.rig.rightArm;
    const leadForeArm = leftLead ? this.rig.leftForeArm : this.rig.rightForeArm;
    const side = leftLead ? -1 : 1;
    this.rotate(this.rig.spine, -0.12 * a, side * (-0.24 * w + 0.34 * s), 0);
    this.rotate(leadArm, -0.48 * w - 1.24 * s, 0, side * (-0.35 * w + 0.54 * s));
    this.rotate(leadForeArm, -0.52 * w - 0.34 * s, 0, 0);
    this.rotate(this.rig.leftHand, 0, progress * Math.PI * 1.5, 0);
    this.rotate(this.rig.rightHand, 0, -progress * Math.PI * 1.5, 0);
    if (state === 'attack4') {
      this.rotate(this.rig.root, 0, THREE.MathUtils.smoothstep(progress, 0.12, 0.72) * Math.PI * 2, 0);
      this.rotate(this.rig.leftArm, -0.9 * a, 0, -0.55 * a);
      this.rotate(this.rig.rightArm, -0.9 * a, 0, 0.55 * a);
      this.rig.root.position.y += a * 0.08;
    } else {
      this.rig.root.position.z += a * 0.13;
    }
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

  private applyBlocking(category: LoadoutCategory): void {
    if (category === 'sword') {
      const brace = Math.sin(this.elapsed * 5.5) * 0.025;
      this.rotate(this.rig.hips, 0, -0.14, 0);
      this.rotate(this.rig.spine, -0.14, -0.18, 0.06);
      this.rotate(this.rig.rightArm, -1.16 + brace, -0.16, 0.28);
      this.rotate(this.rig.rightForeArm, -0.7, 0, 0.16);
      this.rotate(this.rig.rightHand, 0.12, 0, 0.3);
      this.rotate(this.rig.leftArm, -0.62 - brace, 0.1, -0.34);
      this.rotate(this.rig.leftForeArm, -0.76, 0, 0);
      return;
    }
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
