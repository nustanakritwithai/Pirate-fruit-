import * as THREE from 'three';
import type { PiratePlayerRig } from '../art/CharacterRig';
import type { CombatState } from '../combat/CombatState';
import type { SkillRenderType } from '../combat/SkillCasting';
import type { LoadoutCategory } from '../progression/ProgressionTypes';

export type PlayerLocomotion = 'idle' | 'walk' | 'run' | 'swim';

export interface PlayerActionSnapshot {
  combatState: CombatState;
  category: LoadoutCategory;
  locomotion: PlayerLocomotion;
  onGround: boolean;
  /** อ่านจาก MoveState เท่านั้น ไม่เปลี่ยน dash timing */
  dashing?: boolean;
  /** + ขึ้น / - ตก ใช้แบ่ง jump pose */
  verticalVelocity?: number;
  /** 0..1 จาก Combat Core ใช้ sync visual เท่านั้น; ไม่มีผลต่อ hitbox/timing */
  attackProgress?: number;
  /** nonce จาก Damage Pipeline เปลี่ยนหนึ่งครั้งต่อ hit */
  hitReactionId?: number;
  /** มุมแหล่งโจมตีใน local space: 0 หน้า, +PI/2 ขวา */
  hitReactionAngle?: number;
  /** visual-only timeline ของสกิล ไม่เปลี่ยน castTime/cooldown/hitbox */
  skillAnimationProgress?: number;
  /** normalized จุดปล่อยผลจริงจาก Combat Core */
  skillAnimationReleaseProgress?: number;
  skillAnimationType?: SkillRenderType;
  skillAnimationVariant?: number;
  skillAnimationUltimate?: boolean;
  skillAnimationCategory?: LoadoutCategory;
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
  private wasDashing = false;
  private dashTime = 0;
  private wasOnGround = true;
  private previousVerticalVelocity = 0;
  private landingTime = 99;
  private landingStrength = 0;
  private lastHitReactionId = 0;
  private hitReactionTime = 99;
  private hitReactionAngle = 0;

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

    this.updateTransientMotion(dt, snapshot);

    this.restoreBindPose();
    this.applyLocomotion(snapshot.locomotion);
    const hitState = snapshot.combatState === 'stunned' ||
      snapshot.combatState === 'knockback' ||
      snapshot.combatState === 'knockdown' ||
      snapshot.combatState === 'dead';
    const dashActive = Boolean(snapshot.dashing) && !hitState;
    if (dashActive) {
      this.applyDash(snapshot.category);
    } else if (
      !snapshot.onGround &&
      snapshot.locomotion !== 'swim' &&
      snapshot.combatState !== 'dead'
    ) {
      this.applyAirborne(snapshot.verticalVelocity ?? 0);
    } else if (this.landingTime < 0.24 && !hitState) {
      this.applyLanding();
    }

    const state = snapshot.combatState;
    const skillProgress = Number.isFinite(snapshot.skillAnimationProgress)
      ? THREE.MathUtils.clamp(snapshot.skillAnimationProgress!, 0, 1)
      : 1;
    const skillActive = Boolean(snapshot.skillAnimationType) && skillProgress < 1;
    const stanceLocomotion = dashActive || !snapshot.onGround ? 'run' : snapshot.locomotion;
    if (state === 'idle' && !skillActive) {
      this.applyReadyStance(snapshot.category, stanceLocomotion);
    }
    if (isAttack(state)) this.applyAttack(state, snapshot.category, snapshot.attackProgress);
    else if (state === 'casting' && !skillActive) this.applyCasting(snapshot.category);
    else if (state === 'blocking') this.applyBlocking(snapshot.category);
    else if (state === 'stunned') this.applyStunned();
    else if (state === 'knockback') this.applyKnockback();
    else if (state === 'knockdown') this.applyKnockdown();
    else if (state === 'dead') this.applyDeath();

    if (
      skillActive &&
      (state === 'casting' || state === 'idle') &&
      !hitState
    ) {
      this.applySkillAnimation(
        snapshot.skillAnimationType!,
        snapshot.skillAnimationCategory ?? snapshot.category,
        skillProgress,
        snapshot.skillAnimationReleaseProgress ?? 0.3,
        snapshot.skillAnimationVariant ?? 0,
        Boolean(snapshot.skillAnimationUltimate),
      );
    }

    if (
      this.hitReactionTime < 0.3 &&
      state !== 'knockback' &&
      state !== 'knockdown' &&
      state !== 'dead'
    ) {
      this.applyHitReaction();
    }
  }

  private updateTransientMotion(dt: number, snapshot: PlayerActionSnapshot): void {
    const dashing = Boolean(snapshot.dashing);
    if (dashing) this.dashTime = this.wasDashing ? this.dashTime + dt : 0;
    else this.dashTime = 0;

    if (!this.wasOnGround && snapshot.onGround && snapshot.locomotion !== 'swim') {
      this.landingTime = 0;
      this.landingStrength = THREE.MathUtils.clamp(
        -this.previousVerticalVelocity / 9,
        0.45,
        1,
      );
    } else {
      this.landingTime += dt;
    }

    const hitReactionId = snapshot.hitReactionId ?? 0;
    if (hitReactionId !== this.lastHitReactionId) {
      this.lastHitReactionId = hitReactionId;
      this.hitReactionTime = 0;
      this.hitReactionAngle = Number.isFinite(snapshot.hitReactionAngle)
        ? snapshot.hitReactionAngle!
        : 0;
    } else {
      this.hitReactionTime += dt;
    }

    this.wasDashing = dashing;
    this.wasOnGround = snapshot.onGround;
    this.previousVerticalVelocity = snapshot.verticalVelocity ?? 0;
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
      // ท่ายืนผ่อนแรง: ถ่ายน้ำหนักช้า ๆ, เข่าไม่ล็อก, สะโพก/ไหล่สวนกันเล็กน้อย
      const weight = Math.sin(this.elapsed * 0.82);
      const settle = Math.sin(this.elapsed * 1.37 + 0.65);
      const glance = Math.sin(this.elapsed * 0.43 + 0.8);
      this.rig.root.position.x += weight * 0.018;
      this.rig.root.position.y -= 0.007 + Math.max(0, settle) * 0.004;
      this.rotate(this.rig.hips, 0.035 + settle * 0.008, weight * 0.03, weight * 0.042);
      this.rotate(this.rig.spine, -0.018 - breath * 0.008, -weight * 0.026, -weight * 0.032);
      this.rotate(this.rig.chest, -breath * 0.012, weight * 0.018, weight * 0.022);
      this.rotate(this.rig.head, -0.012 + breath * 0.008, glance * 0.022, -weight * 0.014);

      this.rotate(this.rig.leftLeg, -0.045 - settle * 0.012, 0, -0.024 - weight * 0.012);
      this.rotate(this.rig.rightLeg, -0.024 + settle * 0.008, 0, 0.024 - weight * 0.012);
      this.rotate(this.rig.leftLowerLeg, 0.105 + settle * 0.012, 0, 0);
      this.rotate(this.rig.rightLowerLeg, 0.075 - settle * 0.008, 0, 0);
      this.rotate(this.rig.leftFoot, -0.028, 0, weight * 0.008);
      this.rotate(this.rig.rightFoot, -0.018, 0, weight * 0.006);

      this.rotate(this.rig.leftArm, 0.018 + breath * 0.026, 0, -0.018 - weight * 0.012);
      this.rotate(this.rig.rightArm, -0.012 - breath * 0.022, 0, 0.028 - weight * 0.01);
      this.rotate(this.rig.leftForeArm, -0.045 - settle * 0.014, 0, 0);
      this.rotate(this.rig.rightForeArm, -0.07 + settle * 0.012, 0, 0);
      this.rotate(this.rig.leftHand, breath * 0.01, 0, -weight * 0.008);
      this.rotate(this.rig.rightHand, -breath * 0.012, 0, -weight * 0.006);
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

  /** พุ่งต่ำไปข้างหน้า: ลำตัวเอน แขนต้านแรง และขาแยก silhouette จากการวิ่ง */
  private applyDash(category: LoadoutCategory): void {
    const entry = 0.72 + THREE.MathUtils.smoothstep(this.dashTime, 0, 0.055) * 0.28;
    const vibration = Math.sin(this.dashTime * 34) * 0.018;
    this.rig.root.position.y -= 0.07 * entry;
    this.rig.root.position.z += 0.055 * entry;
    this.rotate(this.rig.root, 0.11 * entry, 0, vibration);
    this.rotate(this.rig.hips, 0.2 * entry, 0, -vibration * 1.4);
    this.rotate(this.rig.spine, 0.44 * entry, 0, vibration * 1.8);
    this.rotate(this.rig.head, -0.18 * entry, 0, -vibration);

    this.rotate(this.rig.leftLeg, -0.52 * entry, 0, -0.08);
    this.rotate(this.rig.leftLowerLeg, 0.78 * entry, 0, 0);
    this.rotate(this.rig.rightLeg, 0.56 * entry, 0, 0.08);
    this.rotate(this.rig.rightLowerLeg, 0.18 * entry, 0, 0);
    this.rotate(this.rig.leftFoot, -0.18 * entry, 0, 0);
    this.rotate(this.rig.rightFoot, 0.12 * entry, 0, 0);

    this.rotate(this.rig.leftArm, 0.62 * entry, 0, -0.28 * entry);
    this.rotate(this.rig.leftForeArm, -0.22 * entry, 0, 0);
    if (category === 'sword' || category === 'gun') {
      // มือถืออาวุธนำไปด้านหน้า ส่วนอีกแขนกวาดไปด้านหลัง
      this.rotate(this.rig.rightArm, -0.62 * entry, -0.08, 0.24 * entry);
      this.rotate(this.rig.rightForeArm, -0.48 * entry, 0, 0);
      this.rotate(this.rig.rightHand, -0.12 * entry, 0, -0.12 * entry);
    } else {
      this.rotate(this.rig.rightArm, 0.5 * entry, 0, 0.26 * entry);
      this.rotate(this.rig.rightForeArm, -0.28 * entry, 0, 0);
    }
  }

  /** กระโดดแยก 3 ช่วงจาก vertical velocity: ทะยาน, จุดสูงสุด, ตก */
  private applyAirborne(verticalVelocity: number): void {
    if (verticalVelocity > 0.75) {
      const rise = THREE.MathUtils.clamp(verticalVelocity / 8.5, 0.35, 1);
      this.rig.root.position.y += 0.035 * rise;
      this.rotate(this.rig.hips, 0.1 * rise, 0, -0.04);
      this.rotate(this.rig.spine, 0.16 * rise, 0, 0.06);
      this.rotate(this.rig.leftLeg, -0.68 * rise, 0, -0.08);
      this.rotate(this.rig.leftLowerLeg, 1.02 * rise, 0, 0);
      this.rotate(this.rig.rightLeg, 0.3 * rise, 0, 0.08);
      this.rotate(this.rig.rightLowerLeg, 0.28 * rise, 0, 0);
      this.rotate(this.rig.leftArm, -0.52 * rise, 0, -0.28);
      this.rotate(this.rig.rightArm, -0.28 * rise, 0, 0.32);
      this.rotate(this.rig.leftForeArm, -0.32 * rise, 0, 0);
      return;
    }

    if (verticalVelocity < -0.75) {
      const fall = THREE.MathUtils.clamp(-verticalVelocity / 10, 0.35, 1);
      const flutter = Math.sin(this.elapsed * 10) * 0.035 * fall;
      this.rotate(this.rig.spine, -0.08 * fall, 0, flutter);
      this.rotate(this.rig.head, 0.08 * fall, 0, -flutter);
      this.rotate(this.rig.leftLeg, -0.12 * fall, 0, -0.12);
      this.rotate(this.rig.rightLeg, 0.18 * fall, 0, 0.12);
      this.rotate(this.rig.leftLowerLeg, 0.38 * fall, 0, 0);
      this.rotate(this.rig.rightLowerLeg, 0.48 * fall, 0, 0);
      this.rotate(this.rig.leftArm, 0.08 * fall, 0, -0.52 * fall);
      this.rotate(this.rig.rightArm, 0.08 * fall, 0, 0.52 * fall);
      this.rotate(this.rig.leftForeArm, -0.2 * fall, 0, 0);
      this.rotate(this.rig.rightForeArm, -0.2 * fall, 0, 0);
      return;
    }

    // จุดสูงสุด: เก็บเข่าและกางแขนเพื่อให้เห็นช่วงลอยชัดเจน
    const float = Math.sin(this.elapsed * 4.5) * 0.035;
    this.rig.root.position.y += 0.045 + float * 0.2;
    this.rotate(this.rig.spine, 0.05, 0, float);
    this.rotate(this.rig.leftLeg, -0.38, 0, -0.1);
    this.rotate(this.rig.rightLeg, -0.24, 0, 0.1);
    this.rotate(this.rig.leftLowerLeg, 0.72, 0, 0);
    this.rotate(this.rig.rightLowerLeg, 0.62, 0, 0);
    this.rotate(this.rig.leftArm, -0.12, 0, -0.44);
    this.rotate(this.rig.rightArm, -0.12, 0, 0.44);
  }

  /** ย่อตัวรับแรงเมื่อลงพื้น แล้วคืน bind pose ภายใน 0.24 วินาที */
  private applyLanding(): void {
    const normalized = THREE.MathUtils.clamp(this.landingTime / 0.24, 0, 1);
    const impact = (1 - THREE.MathUtils.smoothstep(normalized, 0, 1)) * this.landingStrength;
    this.rig.root.position.y -= 0.11 * impact;
    this.rig.root.scale.x *= 1 + 0.025 * impact;
    this.rig.root.scale.y *= 1 - 0.045 * impact;
    this.rig.root.scale.z *= 1 + 0.025 * impact;
    this.rotate(this.rig.hips, 0.14 * impact, 0, 0);
    this.rotate(this.rig.spine, 0.24 * impact, 0, 0);
    this.rotate(this.rig.head, -0.12 * impact, 0, 0);
    this.rotate(this.rig.leftLeg, -0.42 * impact, 0, -0.05);
    this.rotate(this.rig.rightLeg, -0.42 * impact, 0, 0.05);
    this.rotate(this.rig.leftLowerLeg, 0.78 * impact, 0, 0);
    this.rotate(this.rig.rightLowerLeg, 0.78 * impact, 0, 0);
    this.rotate(this.rig.leftArm, 0.28 * impact, 0, -0.14 * impact);
    this.rotate(this.rig.rightArm, 0.28 * impact, 0, 0.14 * impact);
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

  /**
   * แปลง timeline จาก Combat Core เป็น anticipation → release → recovery
   * ทุกค่าด้านล่างเป็น pose visual เท่านั้น จึงไม่ขยับ gameplay root/collider
   */
  private applySkillAnimation(
    renderType: SkillRenderType,
    category: LoadoutCategory,
    progress: number,
    releaseProgress: number,
    variant: number,
    ultimate: boolean,
  ): void {
    const releasePoint = THREE.MathUtils.clamp(releaseProgress, 0.04, 0.82);
    const beforeRelease = progress < releasePoint;
    const anticipationProgress = THREE.MathUtils.clamp(progress / releasePoint, 0, 1);
    const followProgress = THREE.MathUtils.clamp(
      (progress - releasePoint) / Math.max(0.001, 1 - releasePoint),
      0,
      1,
    );
    const snap = THREE.MathUtils.smoothstep(followProgress, 0, 0.18);
    const envelope = 1 - THREE.MathUtils.smoothstep(followProgress, 0.46, 1);
    const anticipation = beforeRelease
      ? THREE.MathUtils.smoothstep(anticipationProgress, 0, 1)
      : (1 - snap) * envelope;
    const strike = beforeRelease ? 0 : snap * envelope;
    const side = variant % 2 === 0 ? 1 : -1;
    const power = ultimate ? 1.22 : 1;

    if (renderType === 'projectile') {
      this.applyProjectileSkill(category, anticipation, strike, side, power);
    } else if (renderType === 'aoe') {
      this.applyAreaSkill(category, anticipation, strike, side, power, ultimate);
    } else {
      this.applyDashSkill(category, anticipation, strike, side, power);
    }
  }

  /** ยิง/ปล่อยคลื่น: เก็บแรงข้างลำตัวแล้วส่งไหล่ สะโพก และมือไปข้างหน้า */
  private applyProjectileSkill(
    category: LoadoutCategory,
    anticipation: number,
    strike: number,
    side: number,
    power: number,
  ): void {
    const a = anticipation * power;
    const s = strike * power;
    this.rig.root.position.y -= 0.045 * a;
    this.rig.root.position.z += 0.14 * s;
    this.rotate(this.rig.hips, 0.12 * a - 0.05 * s, -side * 0.3 * a + side * 0.34 * s, 0);
    this.rotate(this.rig.spine, 0.08 * a + 0.2 * s, -side * 0.4 * a + side * 0.46 * s, side * 0.08 * a);
    this.rotate(this.rig.head, -0.05 * s, side * 0.13 * a - side * 0.11 * s, 0);
    this.rotate(this.rig.leftLeg, -0.13 * a - 0.08 * s, 0, -0.045 * a);
    this.rotate(this.rig.rightLeg, -0.05 * a + 0.08 * s, 0, 0.045 * a);
    this.rotate(this.rig.leftLowerLeg, 0.24 * a, 0, 0);
    this.rotate(this.rig.rightLowerLeg, 0.14 * a, 0, 0);

    if (category === 'sword') {
      // ง้างดาบเหนือไหล่ แล้วฟันปล่อยคลื่นเฉียงไปด้านหน้า
      this.rotate(this.rig.rightArm, -0.56 * a - 1.46 * s, -0.2 * a + 0.18 * s, 0.78 * a - 0.92 * s);
      this.rotate(this.rig.rightForeArm, -0.48 * a - 0.28 * s, 0, 0.16 * a - 0.2 * s);
      this.rotate(this.rig.rightHand, 0.12 * a - 0.16 * s, 0, 0.26 * a - 0.34 * s);
      this.rotate(this.rig.leftArm, -0.48 * a - 0.72 * s, 0, -0.28 * a + 0.34 * s);
      this.rotate(this.rig.leftForeArm, -0.68 * a + 0.18 * s, 0, 0);
      return;
    }

    if (category === 'gun') {
      // ตั้งศูนย์สองมือก่อนยิง แล้วถอยไหล่/ศีรษะรับแรงรีคอยล์
      this.rig.root.position.z -= 0.08 * s;
      this.rotate(this.rig.spine, -0.06 * a - 0.2 * s, 0, 0);
      this.rotate(this.rig.rightArm, -1.04 * a - 1.34 * s, -0.12 * (a + s), -0.1 * (a + s));
      this.rotate(this.rig.rightForeArm, -0.52 * a + 0.24 * s, 0, 0);
      this.rotate(this.rig.leftArm, -0.88 * a - 1.08 * s, 0.18, 0.3);
      this.rotate(this.rig.leftForeArm, -0.76 * a + 0.16 * s, 0, 0);
      this.rotate(this.rig.head, 0.12 * s, -side * 0.045 * s, 0);
      return;
    }

    if (category === 'fruit') {
      // รวมพลังระหว่างฝ่ามือแล้วผลักสองมือออกพร้อมกัน
      this.rotate(this.rig.leftArm, -0.72 * a - 1.34 * s, 0.12 * a, -0.46 * a + 0.16 * s);
      this.rotate(this.rig.rightArm, -0.72 * a - 1.34 * s, -0.12 * a, 0.46 * a - 0.16 * s);
      this.rotate(this.rig.leftForeArm, -0.9 * a + 0.48 * s, 0, 0);
      this.rotate(this.rig.rightForeArm, -0.9 * a + 0.48 * s, 0, 0);
      this.rotate(this.rig.leftHand, 0, -0.5 * a + 0.7 * s, -0.18 * s);
      this.rotate(this.rig.rightHand, 0, 0.5 * a - 0.7 * s, 0.18 * s);
      return;
    }

    // style/utility: สลับมือหลักตามช่องสกิลเพื่อไม่ให้ทุกท่าเหมือนกัน
    const leadArm = side > 0 ? this.rig.rightArm : this.rig.leftArm;
    const leadForeArm = side > 0 ? this.rig.rightForeArm : this.rig.leftForeArm;
    const offArm = side > 0 ? this.rig.leftArm : this.rig.rightArm;
    const offForeArm = side > 0 ? this.rig.leftForeArm : this.rig.rightForeArm;
    this.rotate(leadArm, -0.58 * a - 1.46 * s, 0, side * (0.38 * a - 0.34 * s));
    this.rotate(leadForeArm, -0.86 * a + 0.5 * s, 0, 0);
    this.rotate(offArm, -0.62 * a - 0.44 * s, 0, -side * (0.28 * a + 0.08 * s));
    this.rotate(offForeArm, -0.82 * a, 0, 0);
  }

  /** พลังพื้นที่: ย่อตัวสะสมแรง แล้วเปิดลำตัว/แขนให้เกิด silhouette กว้างตอนระเบิด */
  private applyAreaSkill(
    category: LoadoutCategory,
    anticipation: number,
    strike: number,
    side: number,
    power: number,
    ultimate: boolean,
  ): void {
    const a = anticipation * power;
    const s = strike * power;
    this.rig.root.position.y -= 0.14 * a;
    this.rig.root.position.y += 0.075 * s;
    this.rig.root.position.z += 0.07 * s;
    this.rotate(this.rig.root, 0, side * s * (ultimate ? 0.56 : 0.16), 0);
    this.rotate(this.rig.hips, 0.28 * a - 0.1 * s, -side * 0.18 * a, side * 0.04 * s);
    this.rotate(this.rig.spine, 0.42 * a - 0.32 * s, side * 0.18 * a, -side * 0.12 * s);
    this.rotate(this.rig.head, -0.18 * a + 0.14 * s, -side * 0.1 * s, 0);
    this.rotate(this.rig.leftLeg, -0.34 * a + 0.12 * s, 0, -0.09 * a);
    this.rotate(this.rig.rightLeg, -0.3 * a + 0.08 * s, 0, 0.09 * a);
    this.rotate(this.rig.leftLowerLeg, 0.68 * a - 0.18 * s, 0, 0);
    this.rotate(this.rig.rightLowerLeg, 0.62 * a - 0.16 * s, 0, 0);

    if (category === 'sword') {
      // เก็บดาบข้างสะโพกแล้วกวาดวงกว้างตามแนวพื้น
      this.rotate(this.rig.rightArm, -0.42 * a - 0.96 * s, -0.2 * a, 0.72 * a - 1.12 * s);
      this.rotate(this.rig.rightForeArm, -0.64 * a - 0.32 * s, 0, 0.22 * a - 0.26 * s);
      this.rotate(this.rig.rightHand, 0, 0, 0.28 * a - 0.4 * s);
      this.rotate(this.rig.leftArm, -0.5 * a - 0.76 * s, 0, -0.38 * a + 0.66 * s);
      this.rotate(this.rig.leftForeArm, -0.7 * a, 0, 0);
      return;
    }

    if (category === 'fruit') {
      // ดึงพลังเข้ากลางอก ก่อนกางแขนระเบิดรัศมีรอบตัว
      this.rotate(this.rig.leftArm, -0.58 * a - 0.64 * s, 0, -0.48 * a - 0.78 * s);
      this.rotate(this.rig.rightArm, -0.58 * a - 0.64 * s, 0, 0.48 * a + 0.78 * s);
      this.rotate(this.rig.leftForeArm, -1.02 * a + 0.26 * s, 0, 0);
      this.rotate(this.rig.rightForeArm, -1.02 * a + 0.26 * s, 0, 0);
      this.rotate(this.rig.leftHand, 0, -a * 0.6 - s * 0.8, 0);
      this.rotate(this.rig.rightHand, 0, a * 0.6 + s * 0.8, 0);
      return;
    }

    // style/gun/utility: ชูแขนง้างแล้วทุบลง เกิดน้ำหนักชัดที่เข่าและหลัง
    this.rotate(this.rig.leftArm, -1.28 * a + 0.46 * s, 0, -0.32 * a - 0.38 * s);
    this.rotate(this.rig.rightArm, -1.28 * a + 0.46 * s, 0, 0.32 * a + 0.38 * s);
    this.rotate(this.rig.leftForeArm, -0.48 * a - 0.62 * s, 0, 0);
    this.rotate(this.rig.rightForeArm, -0.48 * a - 0.62 * s, 0, 0);
  }

  /** สกิลพุ่ง: ก่อนปล่อยย่อเก็บแรง หลังปล่อยเหยียดตัวเป็นแนวลูกศรไปด้านหน้า */
  private applyDashSkill(
    category: LoadoutCategory,
    anticipation: number,
    strike: number,
    side: number,
    power: number,
  ): void {
    const a = anticipation * power;
    const s = strike * power;
    this.rig.root.position.y -= 0.11 * a + 0.04 * s;
    this.rig.root.position.z += 0.16 * s;
    this.rotate(this.rig.hips, 0.34 * a + 0.18 * s, -side * 0.24 * a, 0);
    this.rotate(this.rig.spine, 0.26 * a + 0.42 * s, side * 0.22 * a, -side * 0.05 * s);
    this.rotate(this.rig.head, -0.13 * a - 0.16 * s, -side * 0.08 * a, 0);
    this.rotate(this.rig.leftLeg, -0.48 * a - 0.32 * s, 0, -0.08);
    this.rotate(this.rig.leftLowerLeg, 0.86 * a + 0.42 * s, 0, 0);
    this.rotate(this.rig.rightLeg, -0.28 * a + 0.54 * s, 0, 0.08);
    this.rotate(this.rig.rightLowerLeg, 0.58 * a + 0.12 * s, 0, 0);

    if (category === 'sword' || category === 'gun') {
      // มือถืออาวุธเป็นหัวลูกศร อีกแขนถ่วงไปด้านหลัง
      this.rotate(this.rig.rightArm, -0.62 * a - 1.12 * s, -0.08 * (a + s), 0.34 * a - 0.2 * s);
      this.rotate(this.rig.rightForeArm, -0.52 * a + 0.34 * s, 0, 0);
      this.rotate(this.rig.rightHand, -0.12 * s, 0, -0.18 * s);
      this.rotate(this.rig.leftArm, 0.36 * a + 0.64 * s, 0, -0.24 * a - 0.34 * s);
      this.rotate(this.rig.leftForeArm, -0.28 * a, 0, 0);
      return;
    }

    const leadArm = side > 0 ? this.rig.rightArm : this.rig.leftArm;
    const leadForeArm = side > 0 ? this.rig.rightForeArm : this.rig.leftForeArm;
    const trailArm = side > 0 ? this.rig.leftArm : this.rig.rightArm;
    const trailForeArm = side > 0 ? this.rig.leftForeArm : this.rig.rightForeArm;
    this.rotate(leadArm, -0.62 * a - 1.18 * s, 0, side * (0.28 * a - 0.18 * s));
    this.rotate(leadForeArm, -0.76 * a + 0.42 * s, 0, 0);
    this.rotate(trailArm, 0.34 * a + 0.68 * s, 0, -side * (0.22 * a + 0.36 * s));
    this.rotate(trailForeArm, -0.26 * a, 0, 0);
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

  /** hit ธรรมดาเป็น overlay สั้น ๆ จึงไม่แทรก CombatState และไม่ยกเลิก action เดิม */
  private applyHitReaction(): void {
    const t = THREE.MathUtils.clamp(this.hitReactionTime / 0.3, 0, 1);
    const fade = 1 - THREE.MathUtils.smoothstep(t, 0, 1);
    const impact = fade * (0.84 + Math.cos(t * Math.PI * 3) * 0.16);
    const side = Math.sin(this.hitReactionAngle);
    const front = Math.cos(this.hitReactionAngle);

    this.rig.root.position.x -= side * 0.055 * impact;
    this.rig.root.position.y += 0.018 * impact;
    this.rig.root.position.z -= front * 0.07 * impact;
    this.rotate(this.rig.root, -front * 0.1 * impact, -side * 0.08 * impact, side * 0.14 * impact);
    this.rotate(this.rig.hips, -front * 0.14 * impact, side * 0.18 * impact, side * 0.08 * impact);
    this.rotate(this.rig.spine, -front * 0.3 * impact, -side * 0.3 * impact, side * 0.24 * impact);
    this.rotate(this.rig.head, front * 0.18 * impact, side * 0.28 * impact, -side * 0.2 * impact);
    this.rotate(this.rig.leftArm, -0.2 * impact, 0, -0.2 * impact - side * 0.12 * impact);
    this.rotate(this.rig.rightArm, -0.2 * impact, 0, 0.2 * impact - side * 0.12 * impact);
    this.rotate(this.rig.leftLowerLeg, 0.2 * impact, 0, 0);
    this.rotate(this.rig.rightLowerLeg, 0.2 * impact, 0, 0);
  }

  private applyStunned(): void {
    const initialImpact = Math.exp(-this.actionTime * 5.5);
    const wobble = Math.sin(this.actionTime * 15) * (0.06 + initialImpact * 0.14);
    this.rig.root.position.y -= 0.055 + initialImpact * 0.035;
    this.rotate(this.rig.hips, -0.14 - initialImpact * 0.12, wobble * 0.4, 0);
    this.rotate(this.rig.spine, -0.2 - initialImpact * 0.22, 0, wobble);
    this.rotate(this.rig.head, 0.2 + initialImpact * 0.18, -wobble * 1.4, -wobble * 0.6);
    this.rotate(this.rig.leftArm, -0.18 - initialImpact * 0.22, 0, -0.34 - wobble);
    this.rotate(this.rig.rightArm, -0.18 - initialImpact * 0.22, 0, 0.34 - wobble);
    this.rotate(this.rig.leftForeArm, -0.42, 0, 0);
    this.rotate(this.rig.rightForeArm, -0.42, 0, 0);
    this.rotate(this.rig.leftLeg, -0.18, 0, -0.04);
    this.rotate(this.rig.rightLeg, -0.18, 0, 0.04);
    this.rotate(this.rig.leftLowerLeg, 0.42, 0, 0);
    this.rotate(this.rig.rightLowerLeg, 0.42, 0, 0);
  }

  private applyKnockback(): void {
    const t = THREE.MathUtils.clamp(this.actionTime / 0.36, 0, 1);
    const amount = 1 - THREE.MathUtils.smoothstep(t, 0, 1);
    this.rig.root.position.y += 0.04 * amount;
    this.rig.root.position.z -= 0.12 * amount;
    this.rotate(this.rig.root, -0.12 * amount, 0, 0);
    this.rotate(this.rig.hips, -0.32 * amount, 0, 0);
    this.rotate(this.rig.spine, -0.58 * amount, 0, 0);
    this.rotate(this.rig.head, 0.32 * amount, 0, 0);
    this.rotate(this.rig.leftArm, -0.76 * amount, 0, -0.34 * amount);
    this.rotate(this.rig.rightArm, -0.76 * amount, 0, 0.34 * amount);
    this.rotate(this.rig.leftForeArm, 0.28 * amount, 0, 0);
    this.rotate(this.rig.rightForeArm, 0.28 * amount, 0, 0);
    this.rotate(this.rig.leftLeg, 0.28 * amount, 0, -0.08 * amount);
    this.rotate(this.rig.rightLeg, -0.38 * amount, 0, 0.08 * amount);
    this.rotate(this.rig.rightLowerLeg, 0.46 * amount, 0, 0);
  }

  private applyKnockdown(): void {
    const amount = THREE.MathUtils.smoothstep(this.actionTime, 0, 0.26);
    const tumble = Math.sin(Math.min(1, this.actionTime / 0.3) * Math.PI) * 0.16;
    this.rig.root.position.y -= 0.34 * amount;
    this.rig.root.position.z -= 0.1 * amount;
    this.rotate(this.rig.root, -0.22 * amount, tumble, -1.3 * amount);
    this.rotate(this.rig.hips, -0.28 * amount, 0, 0.24 * amount);
    this.rotate(this.rig.spine, -0.36 * amount, 0, 0.28 * amount);
    this.rotate(this.rig.head, 0.24 * amount, -0.18 * amount, 0.2 * amount);
    this.rotate(this.rig.leftArm, -0.52 * amount, 0, -0.42 * amount);
    this.rotate(this.rig.rightArm, -0.7 * amount, 0, 0.5 * amount);
    this.rotate(this.rig.leftForeArm, -0.35 * amount, 0, 0);
    this.rotate(this.rig.rightForeArm, 0.3 * amount, 0, 0);
    this.rotate(this.rig.leftLeg, -0.44 * amount, 0, -0.16 * amount);
    this.rotate(this.rig.rightLeg, 0.56 * amount, 0, 0.14 * amount);
    this.rotate(this.rig.leftLowerLeg, 0.72 * amount, 0, 0);
    this.rotate(this.rig.rightLowerLeg, 0.24 * amount, 0, 0);
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
