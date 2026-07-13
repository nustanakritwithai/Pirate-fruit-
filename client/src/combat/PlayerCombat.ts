import * as THREE from 'three';
import type { Input } from '../engine/Input';
import type { CharacterController } from '../player/CharacterController';
import type { MonsterManager, IncomingAttack } from '../monster/MonsterManager';
import type { Effects } from '../effects/Effects';
import type { TouchControls } from '../ui/TouchControls';
import type { Monster } from '../monster/Monster';
import {
  COMBO_WINDOW,
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
  type CombatRewardSource,
  type LoadoutCategory,
} from './CombatData';
import type { SkillLoadout } from './SkillLoadout';
import { resolveActiveSet, type ActiveSkillSet } from './SkillResolver';
import type { CastableSkill } from './SkillCasting';
import {
  type CombatState,
  ATTACK_STATES,
  canStartAttack,
  canCastSkill,
  canBlock,
  isAttackState,
} from './CombatState';
import type { ActiveLoadoutItem } from '../progression/ProgressionTypes';

/** สลอตไม้ตายในอาเรย์คูลดาวน์ 4 ช่อง */
const ULTIMATE_SLOT = 3;

interface WaveProjectile {
  mesh: THREE.Mesh;
  dirX: number;
  dirZ: number;
  life: number;
  radius: number;
  hit: Set<Monster>;
  damage: number;
  source: CombatRewardSource;
}

/** สกิลที่ร่ายค้างอยู่ (state = casting) รอ castTime ครบแล้วปล่อยผล */
interface PendingCast {
  skill: CastableSkill;
  slot: number;
  timer: number;
}

/** จังหวะโจมตี M1 ที่กำลังดำเนินอยู่ (windup → hitbox event → recovery) */
interface ActiveSwing {
  comboIndex: number;
  timer: number;
  hitDone: boolean;
}

/** Phase 6 progression bridge — ใช้ตัวคูณดาเมจตามสเตตจาก mastery/stat */
export interface CombatProgressionAdapter {
  getDamageMultiplier(category: LoadoutCategory): number;
  getMasteryLevel(itemId: string): number;
}

/**
 * Combat Framework ของผู้เล่น (Phase 5 → Phase 7)
 * - State machine: idle/attack1-4/casting/blocking/stunned/knockback/knockdown/dead
 * - M1 คอมโบใช้ "อาวุธที่ถือ" เสมอ (จาก SkillLoadout) ไม่ขึ้นกับชุดสกิลที่ active
 * - 2 ชุดสกิล (อาวุธ / ผลไม้) จาก databook — ปุ่มอาวุธ/R สลับชุดที่ active
 * - ปุ่มสกิล 1-3 + ไม้ตาย สะท้อนชุดของ source ที่ active
 * - Block แบบ Guard Meter + Guard Break, ท่า unblockable ทะลุบล็อก
 */
export class PlayerCombat {
  guard = GUARD_MAX;
  readonly guardMax = GUARD_MAX;

  private set: ActiveSkillSet;

  private combatState: CombatState = 'idle';
  private comboIndex = 0;
  private comboWindowTimer = 0;
  private swing: ActiveSwing | null = null;
  private pendingCast: PendingCast | null = null;
  private stateTimer = 0;
  private guardBroken = false;
  /** คูลดาวน์ 4 สลอต: 0-2 สกิลธรรมดา, 3 ไม้ตาย */
  private skillCooldowns = [0, 0, 0, 0];
  private timeSinceDamaged = 99;

  private readonly projectiles: WaveProjectile[] = [];
  private readonly shield: THREE.Mesh;
  private readonly waveGeo = new THREE.RingGeometry(0.6, 1.7, 22, 1, 0, Math.PI * 0.8);

  constructor(
    private scene: THREE.Scene,
    private input: Input,
    private controller: CharacterController,
    private monsters: MonsterManager,
    private effects: Effects,
    private touch: TouchControls | null,
    private loadout: SkillLoadout,
    private onLoadoutChanged?: () => void,
    private progression?: CombatProgressionAdapter,
  ) {
    this.set = resolveActiveSet(this.loadout);

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
      touch.unlockSkills(['❔', '❔', '❔']);
      touch.unlockUltimate('🔒');
      touch.bindSkillCooldowns([
        () => this.skillCooldownFraction(0),
        () => this.skillCooldownFraction(1),
        () => this.skillCooldownFraction(2),
      ]);
      touch.bindUltimateCooldown(() => this.skillCooldownFraction(ULTIMATE_SLOT));
    }

    this.refreshLoadout();
  }

  // ------------------------------------------------------------------
  // getters สำหรับ UI/ระบบอื่น
  // ------------------------------------------------------------------

  get state(): CombatState {
    return this.combatState;
  }

  /** ไอเทมของชุดสกิลที่ active — StatsPanel/เควสใช้สะท้อนของที่กำลังใช้ */
  get activeItem(): ActiveLoadoutItem {
    return {
      itemId: this.set.itemId ?? this.set.weaponId ?? 'combat',
      category: this.set.category,
      name: this.set.itemName,
    };
  }

  /** ชุดสกิลที่ active ('weapon' หรือ 'fruit') */
  get activeSkillSource(): 'weapon' | 'fruit' {
    return this.set.kind;
  }

  get attackCooldownFraction(): number {
    if (!this.swing) return 0;
    const combo = this.set.m1.combo;
    const hit = combo[Math.min(this.swing.comboIndex, combo.length - 1)];
    const total = hit.windup + hit.recovery;
    return Math.max(0, this.swing.timer) / total;
  }

  skillCooldownFraction(slot: number): number {
    const skill = this.set.slots[slot];
    if (!skill) return 0;
    return Math.max(0, this.skillCooldowns[slot]) / skill.cooldown;
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
      this.guard = Math.max(0, this.guard - attack.amount * GUARD_DAMAGE_FACTOR);
      amount = attack.amount * BLOCK_DAMAGE_RATIO;
      this.effects.spawnHitSpark(this.controller.position, 0x8fd4ff);
      if (this.guard <= 0) {
        this.guardBroken = true;
        this.enterState('stunned', GUARD_BREAK_STUN);
        this.controller.applyStun(GUARD_BREAK_STUN);
        this.touch?.notify('🛡️ โล่แตก!');
      }
    } else if (attack.unblockable && attack.knockback > 0) {
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

  /** เรียกหลัง equip อาวุธ/ผลไม้ที่ร้าน — รีเฟรชชุดสกิล/ไอคอนปุ่ม */
  refreshLoadout(): void {
    // ถ้าชุดผลไม้ active แต่ไม่มีผลไม้ติดตั้ง กลับไปชุดอาวุธ
    if (this.loadout.activeSet === 'fruit' && !this.loadout.snapshot.equippedFruitId) {
      this.loadout.setActiveSet('weapon');
      this.onLoadoutChanged?.();
    }
    this.set = resolveActiveSet(this.loadout);
    this.comboIndex = 0;
    this.refreshTouchLoadout();
  }

  // ------------------------------------------------------------------
  // Loop หลัก
  // ------------------------------------------------------------------

  update(dt: number): void {
    for (let i = 0; i < this.skillCooldowns.length; i++) {
      this.skillCooldowns[i] = Math.max(0, this.skillCooldowns[i] - dt);
    }
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

    // ---------- state timer ----------
    if (this.stateTimer > 0) {
      this.stateTimer -= dt;
      if (
        this.stateTimer <= 0 &&
        ['stunned', 'knockback', 'knockdown', 'dead'].includes(this.combatState)
      ) {
        this.combatState = 'idle';
      }
    }
    if (this.controller.hp <= 0 && this.combatState !== 'dead') this.enterState('dead', 0.8);

    const canAct = this.controller.inputEnabled && !this.controller.isMounted;

    this.advanceSwing(dt);
    this.advanceCast(dt);

    // ---------- Block ----------
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
      (this.shield.material as THREE.MeshBasicMaterial).opacity = 0.1 + 0.18 * this.guardFraction;
    }

    // ---------- ล็อกการเดินตามจังหวะ ----------
    let lock = 1;
    if (this.swing) {
      const combo = this.set.m1.combo;
      lock = combo[Math.min(this.swing.comboIndex, combo.length - 1)].movementLock;
    } else if (this.combatState === 'casting') {
      lock = 0;
    } else if (this.combatState === 'blocking') {
      lock = 0.45;
    }
    this.controller.setMovementLock(lock);

    // ---------- ปุ่มอาวุธ/R = สลับชุดสกิล (อาวุธ ↔ ผลไม้) ----------
    if (
      this.input.consumeWeaponSwitch() &&
      canAct &&
      !this.swing &&
      this.combatState !== 'casting'
    ) {
      this.toggleSkillSource();
    }

    // ---------- คำขอโจมตี M1 (ใช้อาวุธที่ถือเสมอ) ----------
    if (this.input.consumeAttack() && canAct && canStartAttack(this.combatState) && !this.swing) {
      this.startSwing();
    }

    // ---------- คำขอสกิล 1-3 ----------
    const skillRequested = this.input.consumeSkill();
    if (skillRequested >= 1 && canAct && canCastSkill(this.combatState) && !this.pendingCast) {
      this.beginCastSkill(skillRequested - 1);
    }

    // ---------- คำขอไม้ตาย ----------
    if (this.input.consumeUltimate() && canAct && canCastSkill(this.combatState) && !this.pendingCast) {
      this.beginCastSkill(ULTIMATE_SLOT);
    }

    this.updateProjectiles(dt);
  }

  private toggleSkillSource(): void {
    // สลับไปชุดผลไม้ได้ต่อเมื่อมีผลไม้ติดตั้ง
    if (this.loadout.activeSet === 'weapon' && !this.loadout.snapshot.equippedFruitId) {
      this.touch?.notify('ยังไม่มีผลไม้ 🍎 ไปสุ่มที่ร้าน');
      return;
    }
    this.loadout.toggle();
    this.onLoadoutChanged?.();
    this.set = resolveActiveSet(this.loadout);
    this.comboIndex = 0;
    this.refreshTouchLoadout();
    this.touch?.notify(
      `ชุดสกิล${this.set.kind === 'fruit' ? 'ผลไม้' : 'อาวุธ'} ${this.set.itemIcon} ${this.set.itemName}`,
    );
  }

  private enterState(state: CombatState, duration: number): void {
    this.combatState = state;
    this.stateTimer = duration;
    this.swing = null;
    this.pendingCast = null;
  }

  // ------------------------------------------------------------------
  // M1 combo (อาวุธที่ถือ)
  // ------------------------------------------------------------------

  private startSwing(): void {
    const combo = this.set.m1.combo;
    const index = Math.min(this.comboIndex, combo.length - 1);
    this.swing = {
      comboIndex: index,
      timer: combo[index].windup + combo[index].recovery,
      hitDone: false,
    };
    this.combatState = ATTACK_STATES[Math.min(index, ATTACK_STATES.length - 1)];
  }

  private advanceSwing(dt: number): void {
    if (!this.swing) return;
    if (!isAttackState(this.combatState)) {
      this.swing = null;
      return;
    }
    const m1 = this.set.m1;
    const combo = m1.combo;
    const hit = combo[Math.min(this.swing.comboIndex, combo.length - 1)];
    const total = hit.windup + hit.recovery;
    this.swing.timer -= dt;
    const elapsed = total - this.swing.timer;

    if (!this.swing.hitDone && elapsed >= hit.windup) {
      this.swing.hitDone = true;
      const isFinisher = this.swing.comboIndex === combo.length - 1;
      const position = this.controller.position;
      const heading = this.controller.heading;
      this.effects.spawnSlash(position, heading, m1.color, isFinisher ? 1.6 : 1);
      this.monsters.playerAttack(position, heading, {
        damage: m1.damage * hit.multiplier * this.damageMultiplier(this.set.weaponCategory),
        range: m1.range,
        arcCos: Math.cos(THREE.MathUtils.degToRad(m1.arcDeg / 2)),
        knockback: hit.knockback,
        source: this.weaponSource(),
      });
    }

    if (this.swing.timer <= 0) {
      const isFinisher = this.swing.comboIndex === combo.length - 1;
      this.comboIndex = isFinisher ? 0 : this.swing.comboIndex + 1;
      this.comboWindowTimer = COMBO_WINDOW;
      this.swing = null;
      this.combatState = 'idle';
    }
  }

  // ------------------------------------------------------------------
  // สกิล: casting → ปล่อยผล
  // ------------------------------------------------------------------

  private beginCastSkill(slot: number): void {
    if (this.skillCooldowns[slot] > 0) return;
    const skill = this.set.slots[slot];
    if (!skill) {
      this.touch?.notify(slot === ULTIMATE_SLOT ? 'ยังไม่มีไม้ตาย' : 'ยังไม่มีสกิลช่องนี้');
      return;
    }
    if (this.controller.energy < skill.energyCost) {
      this.touch?.notify('พลังงานไม่พอ ⚡');
      return;
    }
    this.controller.energy -= skill.energyCost;
    this.skillCooldowns[slot] = skill.cooldown;
    this.swing = null;
    this.comboIndex = 0;
    this.pendingCast = { skill, slot, timer: skill.castTime };
    this.combatState = 'casting';
  }

  private advanceCast(dt: number): void {
    if (!this.pendingCast) return;
    if (this.combatState !== 'casting') {
      this.pendingCast = null;
      return;
    }
    this.pendingCast.timer -= dt;
    if (this.pendingCast.timer > 0) return;
    const { skill } = this.pendingCast;
    this.pendingCast = null;
    this.combatState = 'idle';
    this.releaseSkill(skill);
  }

  private releaseSkill(skill: CastableSkill): void {
    const position = this.controller.position;
    const heading = this.controller.heading;
    const dirX = Math.sin(heading);
    const dirZ = Math.cos(heading);
    const source = this.skillSource();
    const scaledDamage = skill.damage * this.damageMultiplier(skill.category);

    if (skill.renderType === 'projectile') {
      const mesh = new THREE.Mesh(
        this.waveGeo,
        new THREE.MeshBasicMaterial({
          color: skill.isUltimate ? 0xffd45a : 0x74e8ff,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const scale = skill.isUltimate ? 1.7 : 1;
      mesh.scale.setScalar(scale);
      mesh.position.set(position.x + dirX * 1.2, position.y + 1.15, position.z + dirZ * 1.2);
      mesh.rotation.set(-Math.PI / 2, 0, 0);
      mesh.rotateZ(heading - Math.PI * 0.4);
      this.scene.add(mesh);
      this.projectiles.push({
        mesh,
        dirX,
        dirZ,
        life: WAVE_LIFETIME,
        radius: skill.radius,
        hit: new Set(),
        damage: scaledDamage,
        source,
      });
      this.effects.spawnSlash(position, heading, skill.isUltimate ? 0xffd45a : 0x74e8ff, scale * 1.3);
    } else if (skill.renderType === 'aoe') {
      this.effects.spawnShockwave(position, skill.radius);
      this.monsters.damageRadius(position, skill.radius, scaledDamage, skill.isUltimate ? 10 : 6, source);
    } else {
      // dash
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
      this.effects.spawnSlash(position, heading, 0xffe27a, skill.isUltimate ? 1.9 : 1.5);
    }
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const wave = this.projectiles[i];
      wave.life -= dt;
      wave.mesh.position.x += wave.dirX * WAVE_SPEED * dt;
      wave.mesh.position.z += wave.dirZ * WAVE_SPEED * dt;
      (wave.mesh.material as THREE.MeshBasicMaterial).opacity =
        Math.min(1, wave.life / WAVE_LIFETIME + 0.35) * 0.9;

      for (const monster of this.monsters.monstersNear(
        wave.mesh.position.x,
        wave.mesh.position.z,
        wave.radius,
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

  /** source ของ M1 = อาวุธที่ถือ */
  private weaponSource(): CombatRewardSource {
    return { itemId: this.set.weaponId ?? 'combat', category: this.set.weaponCategory };
  }

  /** source ของสกิล = ไอเทมของชุดสกิลที่ active */
  private skillSource(): CombatRewardSource {
    return { itemId: this.set.itemId ?? this.set.weaponId ?? 'combat', category: this.set.category };
  }

  /** อัปเดตไอคอน/วงแหวน/ปุ่มบนจอสัมผัสให้ตรงกับชุดสกิลที่ active */
  private refreshTouchLoadout(): void {
    if (!this.touch) return;
    const s = this.set.slots;
    this.touch.setSkillIcons([s[0]?.icon ?? '❔', s[1]?.icon ?? '❔', s[2]?.icon ?? '❔']);
    this.touch.setUltimateIcon(s[3]?.icon ?? '🔒');
    // ปุ่มอาวุธแสดงไอคอนของชุดสกิลที่ active (อาวุธ หรือ ผลไม้)
    this.touch.setWeaponIcon(this.set.itemIcon);
    // สกิลที่ resolve มาแล้ว = ปลดล็อกพร้อมใช้ (mastery ล็อกถูกกรองใน resolver)
    this.touch.setSkillMasteryState(1, [0, 0, 0]);
    this.touch.setUltimateMastery(0);
  }
}
