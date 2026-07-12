import * as THREE from 'three';
import type { Input } from '../engine/Input';
import type { CharacterController } from '../player/CharacterController';
import type { MonsterManager, IncomingAttack } from '../monster/MonsterManager';
import type { Effects } from '../effects/Effects';
import type { TouchControls } from '../ui/TouchControls';
import type { Monster } from '../monster/Monster';
import {
  COMBO_WINDOW,
  SKILLS,
  WAVE_SPEED,
  WAVE_LIFETIME,
  LUNGE_DURATION,
  GUARD_MAX,
  GUARD_DAMAGE_FACTOR,
  GUARD_REGEN,
  BLOCK_DAMAGE_RATIO,
  GUARD_BREAK_STUN,
  GUARD_REBLOCK_THRESHOLD,
  PLAYER_KNOCKBACK_SPEED,
  PLAYER_KNOCKBACK_DURATION,
  KNOCKDOWN_STUN,
  REGEN_DELAY,
  REGEN_RATE,
  LOADOUT_ITEMS,
  type CombatRewardSource,
  type LoadoutCategory,
  type SkillDefinition,
} from './CombatData';
import { Loadout } from './Loadout';
import {
  type CombatState,
  ATTACK_STATES,
  canStartAttack,
  canCastSkill,
  canBlock,
  isAttackState,
} from './CombatState';
import type {
  ActiveLoadoutItem,
  SkillRequirement,
} from '../progression/ProgressionTypes';

interface WaveProjectile {
  mesh: THREE.Mesh;
  dirX: number;
  dirZ: number;
  life: number;
  hit: Set<Monster>;
  damage: number;
  source: CombatRewardSource;
}

/** สกิลที่ร่ายค้างอยู่ (state = casting) รอ castTime ครบแล้วปล่อยผล */
interface PendingCast {
  skill: SkillDefinition;
  index: number;
  timer: number;
}

/** จังหวะโจมตี M1 ที่กำลังดำเนินอยู่ (windup → hitbox event → recovery) */
interface ActiveSwing {
  comboIndex: number;
  timer: number;
  hitDone: boolean;
}

export interface CombatProgressionAdapter {
  getDamageMultiplier(category: LoadoutCategory): number;
  getMasteryLevel(itemId: string): number;
  canUseSkill(itemId: string, skill: SkillRequirement): boolean;
  notifySkillLocked?(itemId: string, skill: SkillRequirement): void;
  registerSkillRequirements?(itemId: string, skills: readonly SkillRequirement[]): void;
}

/**
 * Combat Framework ของผู้เล่น (Phase 5)
 * - State machine: idle/attack1-4/casting/blocking/stunned/knockback/knockdown/dead
 * - M1 คอมโบ 4 จังหวะ: windup (animation event สร้าง hitbox) → active → recovery,
 *   ตีครั้งเดียวต่อ swing, ล็อกการเดินบางจังหวะ, จังหวะ 4 knockback
 * - Damage pipeline เดียว: state → cooldown → hitbox → targets → damage → apply →
 *   stun/knockback → reward hook (Phase 6)
 * - Block แบบ Guard Meter: กันแล้วกิน guard, guard หมด → Guard Break (stunned),
 *   ท่า unblockable ทะลุบล็อก
 * - สกิล data-driven ผ่าน SkillDefinition — เพิ่มสกิลใหม่โดยไม่แก้ core
 */
export class PlayerCombat {
  readonly loadout = new Loadout();

  guard = GUARD_MAX;
  readonly guardMax = GUARD_MAX;

  private combatState: CombatState = 'idle';
  private comboIndex = 0;
  private comboWindowTimer = 0;
  private swing: ActiveSwing | null = null;
  private pendingCast: PendingCast | null = null;
  private stateTimer = 0;
  private guardBroken = false;
  private skillCooldowns = [0, 0, 0];
  private timeSinceDamaged = 99;

  private readonly projectiles: WaveProjectile[] = [];
  private lastTouchMasteryKey = '';
  private readonly shield: THREE.Mesh;
  private readonly waveGeo = new THREE.RingGeometry(0.6, 1.7, 22, 1, 0, Math.PI * 0.8);

  constructor(
    private scene: THREE.Scene,
    private input: Input,
    private controller: CharacterController,
    private monsters: MonsterManager,
    private effects: Effects,
    private touch: TouchControls | null,
    private progression?: CombatProgressionAdapter,
  ) {
    this.shield = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
      new THREE.MeshBasicMaterial({
        color: 0x8fd4ff,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.shield.visible = false;
    scene.add(this.shield);

    if (touch) {
      touch.unlockSkills([SKILLS[0].icon, SKILLS[1].icon, SKILLS[2].icon]);
      touch.setWeaponIcon(this.loadout.activeItem.icon);
      touch.bindSkillCooldowns([
        () => this.skillCooldownFraction(0),
        () => this.skillCooldownFraction(1),
        () => this.skillCooldownFraction(2),
      ]);
    }

    for (const item of Object.values(LOADOUT_ITEMS)) {
      this.progression?.registerSkillRequirements?.(
        item.id,
        SKILLS.filter((skill) => skill.category === item.category),
      );
    }
    this.syncTouchMastery();
  }

  // ------------------------------------------------------------------
  // getters สำหรับ UI/ระบบอื่น
  // ------------------------------------------------------------------

  get state(): CombatState {
    return this.combatState;
  }

  get activeItem(): ActiveLoadoutItem {
    const item = this.loadout.activeItem;
    return {
      itemId: item.id,
      category: item.category,
      name: item.name,
    };
  }

  get attackCooldownFraction(): number {
    // ปุ่มโจมตีติดมืดระหว่าง swing (windup+recovery ของจังหวะปัจจุบัน)
    if (!this.swing) return 0;
    const hit = this.loadout.activeItem.combo[this.swing.comboIndex];
    const total = hit.windup + hit.recovery;
    return Math.max(0, this.swing.timer) / total;
  }

  skillCooldownFraction(index: number): number {
    return Math.max(0, this.skillCooldowns[index]) / SKILLS[index].cooldown;
  }

  get guardFraction(): number {
    return this.guard / GUARD_MAX;
  }

  get blocking(): boolean {
    return this.combatState === 'blocking';
  }

  // ------------------------------------------------------------------
  // Damage pipeline ขาเข้า (มอนสเตอร์ → ผู้เล่น)
  // ------------------------------------------------------------------

  /** เรียกจาก MonsterManager ก่อนหักเลือด — ตัดสิน Block/Guard/unblockable/ผลัก คืนดาเมจสุดท้าย */
  modifyIncomingDamage(attack: IncomingAttack): number {
    this.timeSinceDamaged = 0;
    let amount = attack.amount;

    if (this.combatState === 'blocking' && !attack.unblockable) {
      // บล็อกสำเร็จ: ลดดาเมจ แลก guard ตามดาเมจดิบ
      this.guard = Math.max(0, this.guard - attack.amount * GUARD_DAMAGE_FACTOR);
      amount = attack.amount * BLOCK_DAMAGE_RATIO;
      this.effects.spawnHitSpark(this.controller.position, 0x8fd4ff);
      if (this.guard <= 0) {
        // Guard Break: สตันและบล็อกไม่ได้จนกว่า guard ฟื้น
        this.guardBroken = true;
        this.enterState('stunned', GUARD_BREAK_STUN);
        this.controller.applyStun(GUARD_BREAK_STUN);
        this.touch?.notify('🛡️ โล่แตก!');
      }
    } else if (attack.unblockable && attack.knockback > 0) {
      // ท่าหนักทะลุบล็อก: ผลักผู้เล่นกระเด็น (+ล้มถ้ามี tag knockdown)
      const dx = this.controller.position.x - attack.sourceX;
      const dz = this.controller.position.z - attack.sourceZ;
      const len = Math.hypot(dx, dz) || 1;
      this.controller.applyKnockback(
        dx / len,
        dz / len,
        PLAYER_KNOCKBACK_SPEED * (attack.knockback / 8),
        PLAYER_KNOCKBACK_DURATION,
      );
      if (attack.tags.includes('knockdown')) {
        this.enterState('knockdown', KNOCKDOWN_STUN);
        this.controller.applyStun(KNOCKDOWN_STUN);
      } else {
        this.enterState('knockback', PLAYER_KNOCKBACK_DURATION);
      }
    }

    if (this.controller.hp - amount <= 0) this.enterState('dead', 0.8);
    return amount;
  }

  /** แจ้งว่าเพิ่งโดนดาเมจ (หยุด HP regen) — main เรียกจาก onPlayerHit */
  notifyDamaged(): void {
    this.timeSinceDamaged = 0;
  }

  // ------------------------------------------------------------------
  // Loop หลัก
  // ------------------------------------------------------------------

  update(dt: number): void {
    this.syncTouchMastery();
    for (let i = 0; i < 3; i++) this.skillCooldowns[i] = Math.max(0, this.skillCooldowns[i] - dt);
    this.comboWindowTimer -= dt;
    if (this.comboWindowTimer <= 0 && !this.swing) this.comboIndex = 0;

    // ---------- Guard regen (ตอนไม่บล็อก) ----------
    if (this.combatState !== 'blocking' && this.guard < GUARD_MAX) {
      this.guard = Math.min(GUARD_MAX, this.guard + GUARD_REGEN * dt);
      if (this.guardBroken && this.guard >= GUARD_REBLOCK_THRESHOLD) this.guardBroken = false;
    }

    // ---------- HP regen นอกคอมแบต ----------
    this.timeSinceDamaged += dt;
    if (
      this.timeSinceDamaged > REGEN_DELAY &&
      this.controller.hp > 0 &&
      this.controller.hp < this.controller.hpMax &&
      !this.controller.isMounted
    ) {
      this.controller.hp = Math.min(this.controller.hpMax, this.controller.hp + REGEN_RATE * dt);
    }

    // ---------- state timer (stunned/knockback/knockdown/dead หมดเวลาแล้วกลับ idle) ----------
    if (this.stateTimer > 0) {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0 && ['stunned', 'knockback', 'knockdown', 'dead'].includes(this.combatState)) {
        this.combatState = 'idle';
      }
    }
    if (this.controller.hp <= 0 && this.combatState !== 'dead') this.enterState('dead', 0.8);

    const canAct = this.controller.inputEnabled && !this.controller.isMounted;

    // ---------- ดำเนิน swing ที่ค้างอยู่ (windup → hitbox → recovery) ----------
    this.advanceSwing(dt);

    // ---------- ดำเนินการร่ายสกิลที่ค้าง ----------
    this.advanceCast(dt);

    // ---------- Block: ถือปุ่มและ guard ไม่แตก ----------
    const wantBlock = this.input.block && canAct && !this.guardBroken;
    if (wantBlock && canBlock(this.combatState)) {
      this.combatState = 'blocking';
    } else if (this.combatState === 'blocking' && !wantBlock) {
      this.combatState = 'idle';
    }
    this.shield.visible = this.combatState === 'blocking';
    if (this.shield.visible) {
      this.shield.position.copy(this.controller.position);
      this.shield.position.y += 0.35;
      // โล่จางลงตาม guard ที่เหลือ
      (this.shield.material as THREE.MeshBasicMaterial).opacity = 0.1 + 0.18 * this.guardFraction;
    }

    // ---------- ล็อกการเดินตามจังหวะ (ตั้งใหม่ทุกเฟรม) ----------
    let lock = 1;
    if (this.swing) {
      lock = this.loadout.activeItem.combo[this.swing.comboIndex].movementLock;
    } else if (this.combatState === 'casting') {
      lock = 0;
    } else if (this.combatState === 'blocking') {
      lock = 0.45;
    }
    this.controller.setMovementLock(lock);

    // ---------- สลับ Loadout ----------
    if (this.input.consumeWeaponSwitch() && canAct && !this.swing && this.combatState !== 'casting') {
      const item = this.loadout.cycleActive();
      this.comboIndex = 0;
      this.touch?.setWeaponIcon(item.icon);
      this.touch?.notify(`ใช้${item.name}แล้ว ${item.icon}`);
    }

    // ---------- คำขอโจมตี M1 ----------
    const attackRequested = this.input.consumeAttack();
    if (attackRequested && canAct && canStartAttack(this.combatState) && !this.swing) {
      this.startSwing();
    }

    // ---------- คำขอสกิล ----------
    const skillRequested = this.input.consumeSkill();
    if (skillRequested >= 1 && canAct && canCastSkill(this.combatState) && !this.pendingCast) {
      this.beginCast(skillRequested - 1);
    }

    // ---------- projectiles ----------
    this.updateProjectiles(dt);
  }

  private enterState(state: CombatState, duration: number): void {
    this.combatState = state;
    this.stateTimer = duration;
    // โดนขัดจังหวะ = swing/cast ที่ค้างอยู่หลุด
    this.swing = null;
    this.pendingCast = null;
  }

  // ------------------------------------------------------------------
  // M1 combo: windup → hitbox event → recovery
  // ------------------------------------------------------------------

  private startSwing(): void {
    const combo = this.loadout.activeItem.combo;
    const index = Math.min(this.comboIndex, combo.length - 1);
    this.swing = { comboIndex: index, timer: combo[index].windup + combo[index].recovery, hitDone: false };
    this.combatState = ATTACK_STATES[index];
  }

  private advanceSwing(dt: number): void {
    if (!this.swing) return;
    if (!isAttackState(this.combatState)) {
      // โดนสตัน/ตายกลางจังหวะ — ยกเลิก swing
      this.swing = null;
      return;
    }
    const item = this.loadout.activeItem;
    const hit = item.combo[this.swing.comboIndex];
    const total = hit.windup + hit.recovery;
    this.swing.timer -= dt;
    const elapsed = total - this.swing.timer;

    // animation event: hitbox เกิดเมื่อพ้นช่วงง้าง — ตีครั้งเดียวต่อ swing
    if (!this.swing.hitDone && elapsed >= hit.windup) {
      this.swing.hitDone = true;
      const isFinisher = this.swing.comboIndex === item.combo.length - 1;
      const position = this.controller.position;
      const heading = this.controller.heading;
      this.effects.spawnSlash(position, heading, item.color, isFinisher ? 1.6 : 1);
      this.monsters.playerAttack(position, heading, {
        damage: item.damage * hit.multiplier * this.damageMultiplier(item.category),
        range: item.range,
        arcCos: Math.cos(THREE.MathUtils.degToRad(item.arcDeg / 2)),
        knockback: hit.knockback,
        source: this.combatSource(),
      });
    }

    if (this.swing.timer <= 0) {
      // จบจังหวะ: เปิดหน้าต่างต่อคอมโบ
      const isFinisher = this.swing.comboIndex === item.combo.length - 1;
      this.comboIndex = isFinisher ? 0 : this.swing.comboIndex + 1;
      this.comboWindowTimer = COMBO_WINDOW;
      this.swing = null;
      this.combatState = 'idle';
    }
  }

  // ------------------------------------------------------------------
  // สกิล: casting (castTime) → ปล่อยผล
  // ------------------------------------------------------------------

  private beginCast(index: number): void {
    if (this.skillCooldowns[index] > 0) return;
    const skill = SKILLS[index];
    const source = this.combatSource(skill.category);
    if (!this.progression?.canUseSkill(source.itemId, skill) && this.progression) {
      this.touch?.notify(`ต้องการ Mastery ${skill.masteryRequired} 🔒`);
      this.progression.notifySkillLocked?.(source.itemId, skill);
      return;
    }
    if (this.controller.energy < skill.energyCost) {
      this.touch?.notify('พลังงานไม่พอ ⚡');
      return;
    }
    this.controller.energy -= skill.energyCost;
    this.skillCooldowns[index] = skill.cooldown;
    this.swing = null;
    this.comboIndex = 0;
    this.pendingCast = { skill, index, timer: skill.castTime };
    this.combatState = 'casting';
  }

  private advanceCast(dt: number): void {
    if (!this.pendingCast) return;
    if (this.combatState !== 'casting') {
      this.pendingCast = null; // โดนขัดจังหวะ
      return;
    }
    this.pendingCast.timer -= dt;
    if (this.pendingCast.timer > 0) return;
    const { skill } = this.pendingCast;
    this.pendingCast = null;
    this.combatState = 'idle';
    this.releaseSkill(skill);
  }

  private releaseSkill(skill: SkillDefinition): void {
    const position = this.controller.position;
    const heading = this.controller.heading;
    const dirX = Math.sin(heading);
    const dirZ = Math.cos(heading);
    const source = this.combatSource(skill.category);
    const scaledDamage = skill.damage * this.damageMultiplier(skill.category);

    if (skill.tags.includes('projectile')) {
      const mesh = new THREE.Mesh(
        this.waveGeo,
        new THREE.MeshBasicMaterial({
          color: 0x74e8ff,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      mesh.position.set(position.x + dirX * 1.2, position.y + 1.15, position.z + dirZ * 1.2);
      mesh.rotation.set(-Math.PI / 2, 0, 0);
      mesh.rotateZ(heading - Math.PI * 0.4);
      this.scene.add(mesh);
      this.projectiles.push({
        mesh,
        dirX,
        dirZ,
        life: WAVE_LIFETIME,
        hit: new Set(),
        damage: scaledDamage,
        source,
      });
      this.effects.spawnSlash(position, heading, 0x74e8ff, 1.3);
    } else if (skill.tags.includes('aoe')) {
      this.effects.spawnShockwave(position, skill.radius);
      this.monsters.damageRadius(
        position,
        skill.radius,
        scaledDamage,
        skill.tags.includes('knockback-heavy') ? 10 : 4,
        source,
      );
    } else if (skill.tags.includes('dash')) {
      this.controller.startDash(dirX, dirZ, skill.range / LUNGE_DURATION, LUNGE_DURATION);
      const samplePoint = new THREE.Vector3();
      const damaged = new Set<Monster>();
      for (let step = 0; step <= 3; step++) {
        samplePoint.set(
          position.x + (dirX * skill.range * step) / 3,
          position.y,
          position.z + (dirZ * skill.range * step) / 3,
        );
        for (const monster of this.monsters.monstersNear(samplePoint.x, samplePoint.z, skill.radius)) {
          if (damaged.has(monster)) continue;
          damaged.add(monster);
          this.monsters.applyHit(monster, scaledDamage, position.x, position.z, 6, source);
        }
      }
      this.effects.spawnSlash(position, heading, 0xffe27a, 1.5);
    }
  }

  private updateProjectiles(dt: number): void {
    const waveSkill = SKILLS.find((skill) => skill.tags.includes('projectile'));
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const wave = this.projectiles[i];
      wave.life -= dt;
      wave.mesh.position.x += wave.dirX * WAVE_SPEED * dt;
      wave.mesh.position.z += wave.dirZ * WAVE_SPEED * dt;
      (wave.mesh.material as THREE.MeshBasicMaterial).opacity =
        Math.min(1, wave.life / WAVE_LIFETIME + 0.35) * 0.9;

      if (waveSkill) {
        for (const monster of this.monsters.monstersNear(
          wave.mesh.position.x,
          wave.mesh.position.z,
          waveSkill.radius,
        )) {
          if (wave.hit.has(monster)) continue;
          wave.hit.add(monster);
          this.monsters.applyHit(
            monster,
            wave.damage,
            wave.mesh.position.x - wave.dirX,
            wave.mesh.position.z - wave.dirZ,
            5,
            wave.source,
          );
        }
      }

      if (wave.life <= 0) {
        this.scene.remove(wave.mesh);
        (wave.mesh.material as THREE.Material).dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  private damageMultiplier(category: LoadoutCategory): number {
    return this.progression?.getDamageMultiplier(category) ?? 1;
  }

  private combatSource(category?: LoadoutCategory): CombatRewardSource {
    const loadoutItem = category ? this.loadout.itemIn(category) : this.loadout.activeItem;
    const item = loadoutItem ?? this.loadout.activeItem;
    return {
      itemId: item.id,
      category: item.category,
    };
  }

  private syncTouchMastery(): void {
    if (!this.touch) return;
    const firstSkill = SKILLS[0];
    const item = this.loadout.itemIn(firstSkill.category) ?? this.loadout.activeItem;
    const mastery = this.progression?.getMasteryLevel(item.id) ?? 1;
    const key = `${item.id}:${mastery}`;
    if (key === this.lastTouchMasteryKey) return;
    this.lastTouchMasteryKey = key;
    this.touch.setSkillMasteryState(
      mastery,
      SKILLS.map((skill) => skill.masteryRequired),
    );
  }
}
