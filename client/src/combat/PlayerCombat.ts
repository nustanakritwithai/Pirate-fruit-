import * as THREE from 'three';
import type { Input } from '../engine/Input';
import type { CharacterController } from '../player/CharacterController';
import type { MonsterManager, IncomingAttack } from '../monster/MonsterManager';
import type { Effects, EnergyProjectileVisual } from '../effects/Effects';
import type { ScopedVisualEffects } from '../realtime/ScopedVisualEffects';
import { createPlayerShieldVisual } from '../art/PlayerShieldVisual';
import type { NavalCombat } from '../boat/NavalCombat';
import type { SkillAimCommand, SkillAimPreview, TouchControls } from '../ui/TouchControls';
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
import { resolveActiveSet, resolveEquippedItems, type ActiveSkillSet } from './SkillResolver';
import type { CastableSkill, SkillRenderType } from './SkillCasting';
import type { CcSpec, DotSpec } from './skillGameplay';
import {
  type CombatState,
  ATTACK_STATES,
  canStartAttack,
  canCastSkill,
  canBlock,
  isAttackState,
} from './CombatState';
import type { ActiveLoadoutItem } from '../progression/ProgressionTypes';
import type { RealtimeKnockback } from '@pirate-fruit/shared';
import type { SharedMonsterActor } from '../monster/SharedMonsterClient';

/** สลอตไม้ตายในอาเรย์คูลดาวน์ 4 ช่อง */
const ULTIMATE_SLOT = 3;

interface WaveProjectile {
  visual: EnergyProjectileVisual;
  originX: number;
  originZ: number;
  travelRange: number;
  dirX: number;
  dirZ: number;
  life: number;
  lifetimeMs: number;
  radius: number;
  hit: Set<Monster>;
  /** กันกระสุนเวทลูกเดิมทำดาเมจเรือลำเดิมซ้ำทุกเฟรม */
  hitShips: Set<string>;
  damage: number;
  knockback: number;
  source: CombatRewardSource;
  dot?: DotSpec;
  /** homing: เลี้ยวเข้าหาเป้าที่จับไว้ทุกเฟรม */
  homing?: boolean;
  target?: Monster | null;
}

/** ร่าง/ป้อมที่เรียกออกมา (summon) — ลอยอยู่กับที่แล้วยิงใส่มอนใกล้สุดเป็นช่วง ๆ */
interface ActiveSummon {
  actorId: string;
  spawnSequence: number;
  skillId: string;
  visual: EnergyProjectileVisual;
  x: number;
  y: number;
  z: number;
  dirX: number;
  dirZ: number;
  attackRange: number;
  life: number;
  lifetimeMs: number;
  fireAcc: number;
  fireInterval: number;
  radius: number;
  damage: number;
  acquireRange: number;
  color: number;
  source: CombatRewardSource;
}

/** channel ที่กำลังทำงาน (flurry มัดรัว / beam ลำแสง) — ฉีดดาเมจเป็น tick ระหว่างล็อกท่า */
interface SkillChannel {
  kind: 'flurry' | 'beam';
  skill: CastableSkill;
  dirX: number;
  dirZ: number;
  perTickDamage: number;
  totalTicks: number;
  ticksDone: number;
  tickInterval: number;
  tickAcc: number;
  knockback: number;
  color: number;
  source: CombatRewardSource;
}

/** โซนพุ่งจากพื้น (ground) — telegraph สั้นก่อนระเบิด */
interface PendingZone {
  timer: number;
  x: number;
  z: number;
  radius: number;
  damage: number;
  knockback: number;
  color: number;
  source: CombatRewardSource;
  dot?: DotSpec;
}

/** โซนพิษ/ไฟค้างพื้น — มอนที่อยู่ในรัศมีโดน tick ต่อเนื่อง */
interface DotField {
  x: number;
  z: number;
  radius: number;
  dps: number;
  remaining: number;
  tickAcc: number;
  color: number;
  source: CombatRewardSource;
}

/** DoT ติดตัวมอนสเตอร์รายตัว (พิษ/ไฟจากการโดนสกิล) */
interface ActiveDot {
  monster: Monster;
  dps: number;
  remaining: number;
  tickAcc: number;
  source: CombatRewardSource;
}

/** visual-only socket bridge — EquipmentVisuals คืนสำเนาพิกัด world โดยไม่ให้ combat แก้ rig */
export interface CombatVisualAnchorProvider {
  getSwordBladeWorldSegment(): { base: THREE.Vector3; tip: THREE.Vector3 } | null;
  getGunMuzzleWorldRay(): { origin: THREE.Vector3; direction: THREE.Vector3 } | null;
}

/** สกิลที่ร่ายค้างอยู่ (state = casting) รอ castTime ครบแล้วปล่อยผล */
interface PendingCast {
  skill: CastableSkill;
  slot: number;
  timer: number;
  dirX?: number;
  dirZ?: number;
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

/** มุมแหล่งโจมตีในแกน local ของผู้เล่น: 0 = หน้า, +PI/2 = ขวา */
export function getRelativeHitAngle(
  playerX: number,
  playerZ: number,
  heading: number,
  sourceX: number,
  sourceZ: number,
): number {
  const dx = sourceX - playerX;
  const dz = sourceZ - playerZ;
  if (Math.hypot(dx, dz) < 0.0001) return 0;
  const localRight = dx * Math.cos(heading) - dz * Math.sin(heading);
  const localForward = dx * Math.sin(heading) + dz * Math.cos(heading);
  return Math.atan2(localRight, localForward);
}

/** HP local regen is presentation/gameplay fallback only; never heal through an active Server PvP window. */
export function canRegenerateHp(
  timeSinceDamaged: number,
  authoritativeCombatTimer: number,
  hp: number,
  hpMax: number,
  mounted: boolean,
): boolean {
  return authoritativeCombatTimer <= 0
    && timeSinceDamaged > REGEN_DELAY
    && hp > 0
    && hp < hpMax
    && !mounted;
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
  /** คูลดาวน์รายสกิล (key = skill.id) — เดินตามเวลาจริง ไม่รีเซ็ตตอนสลับชุดสกิล */
  private readonly skillCooldowns = new Map<string, number>();
  private timeSinceDamaged = 99;
  private authoritativeCombatTimer = 0;
  private damageReactionSerial = 0;
  private damageReactionAngle = 0;
  /**
   * visual-only skill lifecycle: ยาวกว่าช่วง cast เล็กน้อยเพื่อให้ Animator วาด follow-through
   * โดยไม่ยืด castTime, cooldown, movement lock หรือจังหวะปล่อย hitbox
   */
  private skillVisualElapsed = 1;
  private skillVisualDuration = 1;
  private skillVisualReleaseProgress = 0.3;
  private skillVisualType: SkillRenderType = 'projectile';
  private skillVisualVariant = 0;
  private skillVisualUltimate = false;
  private skillVisualCategory: LoadoutCategory = 'style';

  private readonly projectiles: WaveProjectile[] = [];
  private readonly summons: ActiveSummon[] = [];
  private summonSequence = 0;
  private presentationStateSequence = 0;
  private readonly endedSummons: Array<{
    actorId: string;
    spawnSequence: number;
    skillId: string;
    type: string;
    x: number;
    y: number;
    z: number;
    dirX: number;
    dirZ: number;
    color: number;
  }> = [];
  /** channel/zone/dot/buff — รูปแบบสกิลใหม่ (flurry/beam/ground/DoT/buff) */
  private activeChannel: SkillChannel | null = null;
  private readonly pendingZones: PendingZone[] = [];
  private readonly dotFields: DotField[] = [];
  private readonly activeDots: ActiveDot[] = [];
  private skillBuffTimer = 0;
  private skillBuffMultiplier = 1;
  private readonly shield: THREE.Mesh;
  private readonly skillPreviewRoot: THREE.Group;
  private readonly skillPreviewRing: THREE.Mesh;
  private readonly skillPreviewArrow: THREE.Mesh;
  private visualAnchors: CombatVisualAnchorProvider | null = null;

  /**
   * S15: hook เจตนาโจมตี PvP — ถูกเรียกเมื่อ M1 ลง hitbox และเมื่อปล่อยสกิล
   * main.ts ผูกให้หาผู้เล่นคนอื่นในกรวยแล้วส่ง attack intent ให้ Server ตัดสิน
   */
  onPvpAttack?: (info: {
    origin: THREE.Vector3;
    forwardX: number;
    forwardZ: number;
    kind: 'melee' | 'skill';
    category: LoadoutCategory;
    skillId?: string;
    /** Client presentation/targeting range; Server still validates authority. */
    range: number;
  }) => void;

  /** S16 hook for delayed summon shots against the shared authoritative monster world. */
  onSharedMonsterAttack?: (info: {
    origin: THREE.Vector3;
    forwardX: number;
    forwardZ: number;
    range: number;
    kind: 'melee' | 'skill';
    category: LoadoutCategory;
    area?: number;
  }) => void;

  constructor(
    private scene: THREE.Scene,
    private input: Input,
    private controller: CharacterController,
    private monsters: MonsterManager,
    private effects: Effects | ScopedVisualEffects,
    private touch: TouchControls | null,
    private loadout: SkillLoadout,
    private onLoadoutChanged?: () => void,
    private progression?: CombatProgressionAdapter,
    private navalCombat?: Pick<NavalCombat, 'damageNearestEnemyShipFromSkill'>,
    private getCameraYaw?: () => number,
  ) {
    this.set = resolveActiveSet(this.loadout);

    this.shield = createPlayerShieldVisual();
    this.shield.visible = false;
    this.scene.add(this.shield);

    this.skillPreviewRoot = new THREE.Group();
    this.skillPreviewRoot.name = 'skill-aim-preview';
    this.skillPreviewRing = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.58, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x8ff0cd, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.skillPreviewArrow = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.035, 1),
      new THREE.MeshBasicMaterial({ color: 0x8ff0cd, transparent: true, opacity: 0.58, depthWrite: false }),
    );
    this.skillPreviewRoot.add(this.skillPreviewRing, this.skillPreviewArrow);
    this.skillPreviewRoot.visible = false;
    this.scene.add(this.skillPreviewRoot);

    if (touch) {
      touch.unlockSkills(['❔', '❔', '❔']);
      touch.unlockUltimate('🔒');
      touch.bindSkillCooldowns([
        () => this.skillCooldownView(0),
        () => this.skillCooldownView(1),
        () => this.skillCooldownView(2),
      ]);
      touch.bindUltimateCooldown(() => this.skillCooldownView(ULTIMATE_SLOT));
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

  /** มีผลไม้ติดตัวหรือไม่ — ใช้กับกฎน้ำ ไม่ขึ้นกับชุดสกิลที่กำลัง active */
  get hasDevilFruit(): boolean {
    return Boolean(this.loadout.snapshot.equippedFruitId);
  }

  /** ไอเทมที่ติดตั้งแยกต่อชิ้น (อาวุธ + ผลไม้) — สำหรับโชว์ mastery ต่อชิ้นพร้อมกัน */
  get masteryItems(): ActiveLoadoutItem[] {
    const { weapon, fruit } = resolveEquippedItems(this.loadout);
    return fruit ? [weapon, fruit] : [weapon];
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
    return Math.max(0, this.skillCooldowns.get(skill.id) ?? 0) / skill.cooldown;
  }

  skillCooldownRemaining(slot: number): number {
    const skill = this.set.slots[slot];
    if (!skill) return 0;
    return Math.max(0, this.skillCooldowns.get(skill.id) ?? 0);
  }

  private skillCooldownView(slot: number): { fraction: number; remainingSeconds: number } {
    return {
      fraction: this.skillCooldownFraction(slot),
      remainingSeconds: this.skillCooldownRemaining(slot),
    };
  }

  get guardFraction(): number {
    return this.guard / GUARD_MAX;
  }

  get blocking(): boolean {
    return this.combatState === 'blocking';
  }

  /** visual-only nonce: เปลี่ยนทุกครั้งที่รับ hit โดยไม่สร้าง CombatState ใหม่ */
  get hitReactionId(): number {
    return this.damageReactionSerial;
  }

  /** มุมแหล่งโจมตีเทียบกับด้านหน้าผู้เล่น ใช้เลือกทิศสะดุ้ง */
  get hitReactionAngle(): number {
    return this.damageReactionAngle;
  }

  /** 0..1 สำหรับ animation เท่านั้น; 1 หมายถึงจบท่าแล้ว */
  get skillAnimationProgress(): number {
    if (this.skillVisualDuration <= 0) return 1;
    return THREE.MathUtils.clamp(this.skillVisualElapsed / this.skillVisualDuration, 0, 1);
  }

  /** จุดที่ Combat Core ปล่อยผลสกิลจริงใน normalized animation timeline */
  get skillAnimationReleaseProgress(): number {
    return this.skillVisualReleaseProgress;
  }

  get skillAnimationType(): SkillRenderType {
    return this.skillVisualType;
  }

  get skillAnimationVariant(): number {
    return this.skillVisualVariant;
  }

  get skillAnimationUltimate(): boolean {
    return this.skillVisualUltimate;
  }

  get skillAnimationCategory(): LoadoutCategory {
    return this.skillVisualCategory;
  }

  /** late-bind หลังสร้าง EquipmentVisuals เพื่อเลี่ยง ownership/circular dependency */
  bindVisualAnchors(provider: CombatVisualAnchorProvider): void {
    this.visualAnchors = provider;
  }

  // ------------------------------------------------------------------
  // Damage pipeline ขาเข้า (มอนสเตอร์ → ผู้เล่น)
  // ------------------------------------------------------------------

  /** เรียกจาก MonsterManager ก่อนหักเลือด — ตัดสิน Block/Guard/unblockable/ผลัก คืนดาเมจสุดท้าย */
  modifyIncomingDamage(attack: IncomingAttack): number {
    this.timeSinceDamaged = 0;
    this.damageReactionSerial++;
    this.damageReactionAngle = getRelativeHitAngle(
      this.controller.position.x,
      this.controller.position.z,
      this.controller.heading,
      attack.sourceX,
      attack.sourceZ,
    );
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

  /** Keep local regeneration/healing out of an active authoritative combat exchange. */
  markCombatActivity(): void {
    this.timeSinceDamaged = 0;
    this.authoritativeCombatTimer = Math.max(this.authoritativeCombatTimer, REGEN_DELAY + 1);
  }

  /** Respawn is authoritative and must immediately release stale local combat locks. */
  notifyRespawn(): void {
    this.cancelPendingCast();
    this.activeChannel = null;
    this.swing = null;
    this.combatState = 'idle';
    this.stateTimer = 0;
    this.controller.setMovementLock(1);
  }

  /** Apply a Server-confirmed PvP hit to the local presentation/movement only. */
  notifyAuthoritativeHit(knockback?: RealtimeKnockback, applyImpulse = true): void {
    this.markCombatActivity();
    this.damageReactionSerial++;
    if (!knockback) {
      this.damageReactionAngle = 0;
      return;
    }
    const directionLength = Math.hypot(knockback.directionX, knockback.directionZ) || 1;
    const directionX = knockback.directionX / directionLength;
    const directionZ = knockback.directionZ / directionLength;
    // The attacker is opposite the impulse direction, so the existing hit overlay
    // leans away from the authoritative source rather than toward it.
    this.damageReactionAngle = getRelativeHitAngle(
      this.controller.position.x,
      this.controller.position.z,
      this.controller.heading,
      this.controller.position.x - directionX,
      this.controller.position.z - directionZ,
    );
    if (!applyImpulse) return;
    const speed = Math.max(0, Number(knockback.speed));
    const duration = Math.max(0.05, Number(knockback.duration));
    const stunDuration = Math.max(0.05, Number(knockback.stunDuration ?? duration));
    if (speed > 0) {
      // Lock local input for the authoritative hit-stun window so the defender
      // cannot immediately trade damage back while being launched.
      this.controller.applyStun(stunDuration);
      this.controller.applyKnockback(directionX, directionZ, speed, duration);
      this.enterState('knockback', stunDuration);
    }
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
    this.skillVisualElapsed = Math.min(
      this.skillVisualDuration,
      this.skillVisualElapsed + Math.max(0, dt),
    );

    // คูลดาวน์ทุกสกิล (ทั้งชุดอาวุธและผลไม้) เดินถอยหลังพร้อมกันตามเวลาจริง
    for (const [id, remaining] of this.skillCooldowns) {
      const next = remaining - dt;
      if (next <= 0) this.skillCooldowns.delete(id);
      else this.skillCooldowns.set(id, next);
    }
    this.comboWindowTimer -= dt;
    if (this.comboWindowTimer <= 0 && !this.swing) this.comboIndex = 0;

    // ---------- Guard regen (ตอนไม่บล็อก) ----------
    if (this.combatState !== 'blocking' && this.guard < GUARD_MAX) {
      this.guard = Math.min(GUARD_MAX, this.guard + GUARD_REGEN * dt);
      if (this.guardBroken && this.guard >= GUARD_REBLOCK_THRESHOLD) this.guardBroken = false;
    }

    // ---------- HP regen นอกคอมแบต ----------
    this.authoritativeCombatTimer = Math.max(0, this.authoritativeCombatTimer - dt);
    this.timeSinceDamaged += dt;
    if (canRegenerateHp(
      this.timeSinceDamaged,
      this.authoritativeCombatTimer,
      this.controller.hp,
      this.controller.hpMax,
      this.controller.isMounted,
    )) {
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

    if (this.controller.isMounted && (this.pendingCast || this.activeChannel)) {
      this.cancelPendingCast();
      this.activeChannel = null;
      if (this.combatState === 'casting') this.combatState = 'idle';
    }
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

    // ---------- เป้า preview ของสกิลมือถือ (กดค้าง/ลาก) ----------
    this.updateSkillAimPreview();

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
    const skillAim = this.input.consumeSkillAim();
    if (skillAim && skillAim.slot >= 1 && skillAim.slot <= 3 && canAct && canCastSkill(this.combatState) && !this.pendingCast) {
      this.beginCastSkill(skillAim.slot - 1, skillAim);
    }

    // ---------- คำขอไม้ตาย ----------
    const ultimateAim = this.input.consumeUltimateAim();
    if (ultimateAim && canAct && canCastSkill(this.combatState) && !this.pendingCast) {
      this.beginCastSkill(ULTIMATE_SLOT, ultimateAim);
    }

    this.updateProjectiles(dt);
    this.updateSummons(dt);
    this.advanceChannel(dt);
    this.updateZones(dt);
    this.updateDots(dt);
    if (this.skillBuffTimer > 0) this.skillBuffTimer -= dt;
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
    this.cancelPendingCast();
    this.activeChannel = null; // โดนขัด (stun/knockback) → หยุด channel มัดรัว/ลำแสง
    if (state === 'stunned' || state === 'knockback' || state === 'knockdown' || state === 'dead') {
      this.skillVisualElapsed = this.skillVisualDuration;
    }
  }

  private cancelPendingCast(): void {
    const pending = this.pendingCast;
    if (!pending) return;
    this.pendingCast = null;
    this.controller.mp = Math.min(this.controller.mpMax, this.controller.mp + pending.skill.energyCost);
    this.skillCooldowns.delete(pending.skill.id);
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
      const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
      let nearestHit: THREE.Vector3 | null = null;
      let nearestDistanceSq = Number.POSITIVE_INFINITY;
      this.monsters.playerAttack(position, heading, {
        damage: m1.damage * hit.multiplier * this.damageMultiplier(this.set.weaponCategory),
        range: m1.range,
        arcCos: Math.cos(THREE.MathUtils.degToRad(m1.arcDeg / 2)),
        knockback: hit.knockback,
        source: this.weaponSource(),
        onHit: (monster) => {
          const distanceSq = monster.group.position.distanceToSquared(position);
          if (distanceSq >= nearestDistanceSq) return;
          nearestDistanceSq = distanceSq;
          nearestHit = monster.group.position.clone();
          nearestHit.y += monster.type.kind === 'crab' ? 0.65 : 1.05 * monster.type.scale;
        },
      });
      // S15: แจ้งเจตนาโจมตี PvP (Server ตัดสินว่าโดนผู้เล่นคนอื่นไหม/ดาเมจเท่าไร)
      this.onPvpAttack?.({
        origin: position.clone(),
        forwardX: forward.x,
        forwardZ: forward.z,
        kind: 'melee',
        category: this.set.weaponCategory,
        range: m1.range,
      });
      this.onSharedMonsterAttack?.({
        origin: position.clone(),
        forwardX: forward.x,
        forwardZ: forward.z,
        kind: 'melee',
        category: this.set.weaponCategory,
        range: m1.range,
      });

      if (this.set.weaponCategory === 'sword') {
        const blade = this.visualAnchors?.getSwordBladeWorldSegment();
        if (blade) {
          this.effects.spawnBladeTrail(
            blade.base,
            blade.tip,
            position,
            heading,
            this.swing.comboIndex,
            m1.color,
            isFinisher,
          );
        } else {
          this.effects.spawnSlash(position, heading, m1.color, isFinisher ? 1.6 : 1);
        }
      } else if (this.set.weaponCategory === 'gun') {
        const muzzle = this.visualAnchors?.getGunMuzzleWorldRay();
        const origin = muzzle?.origin ?? position.clone().add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(forward, 0.65);
        const muzzleDirection = muzzle?.direction && muzzle.direction.dot(forward) > 0.35
          ? muzzle.direction
          : forward;
        const endpoint = nearestHit ?? origin.clone().addScaledVector(muzzleDirection, m1.range);
        this.effects.spawnGunShot(
          origin,
          endpoint,
          m1.color,
          nearestHit !== null,
          isFinisher ? 1.25 : 1,
        );
      } else {
        this.effects.spawnSlash(position, heading, m1.color, isFinisher ? 1.6 : 1);
      }
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

  private screenAimToWorld(aim: Pick<SkillAimCommand, 'screenX' | 'screenZ'>): { x: number; z: number } {
    const rawX = aim.screenX ?? 0;
    const rawZ = aim.screenZ ?? -1;
    const length = Math.hypot(rawX, rawZ) || 1;
    const x = rawX / length;
    const z = rawZ / length;
    const yaw = this.getCameraYaw?.() ?? this.controller.heading - Math.PI;
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    const worldX = x * cos + z * sin;
    const worldZ = -x * sin + z * cos;
    const worldLength = Math.hypot(worldX, worldZ) || 1;
    return { x: worldX / worldLength, z: worldZ / worldLength };
  }

  private updateSkillAimPreview(): void {
    const aim: SkillAimPreview | null = this.input.getSkillAimPreview();
    if (!aim || !this.controller.inputEnabled || this.controller.isMounted) {
      this.skillPreviewRoot.visible = false;
      return;
    }
    const slot = aim.slot === 4 ? ULTIMATE_SLOT : aim.slot - 1;
    const skill = this.set.slots[slot];
    if (!skill) {
      this.skillPreviewRoot.visible = false;
      return;
    }
    const direction = this.screenAimToWorld(aim);
    const distance =
      skill.renderType === 'aoe' || skill.renderType === 'buff'
        ? 0
        : skill.renderType === 'ground' || skill.renderType === 'summon'
          ? skill.range * 0.65
          : Math.min(Math.max(skill.range, 2.5), 14);
    const radius = Math.min(5, Math.max(0.5, skill.radius || 0.65));
    this.skillPreviewRoot.position.copy(this.controller.position);
    this.skillPreviewRing.position.set(direction.x * distance, 0.04, direction.z * distance);
    this.skillPreviewRing.scale.setScalar(radius / 0.52);
    this.skillPreviewArrow.visible = distance > 0.1;
    this.skillPreviewArrow.position.set(direction.x * distance * 0.5, 0.045, direction.z * distance * 0.5);
    this.skillPreviewArrow.rotation.y = Math.atan2(direction.x, direction.z);
    this.skillPreviewArrow.scale.set(1, 1, distance);
    (this.skillPreviewRing.material as THREE.MeshBasicMaterial).color.setHex(skill.color);
    (this.skillPreviewArrow.material as THREE.MeshBasicMaterial).color.setHex(skill.color);
    this.skillPreviewRoot.visible = true;
  }

  private beginCastSkill(slot: number, aim?: SkillAimCommand): void {
    const skill = this.set.slots[slot];
    if (!skill) {
      const info = this.set.slotInfo[slot];
      if (info?.hasSkill && info.locked) {
        this.touch?.notify(`🔒 ต้องการ Mastery ${info.masteryRequired}`);
      } else {
        this.touch?.notify(slot === ULTIMATE_SLOT ? 'ยังไม่มีไม้ตาย' : 'ยังไม่มีสกิลช่องนี้');
      }
      return;
    }
    // คูลดาวน์รายสกิล — สกิลชุดอื่นที่สลอตเดียวกันจะไม่บล็อกกัน
    if ((this.skillCooldowns.get(skill.id) ?? 0) > 0) return;
    // สกิลใช้ MP (พลังเวท) — Energy เหลือไว้เป็นสเตมินา (วิ่ง/พุ่ง)
    if (this.controller.mp < skill.energyCost) {
      this.touch?.notify('MP ไม่พอ 🔵');
      return;
    }
    this.controller.mp -= skill.energyCost;
    this.skillCooldowns.set(skill.id, skill.cooldown);
    this.swing = null;
    this.comboIndex = 0;
    const direction = aim && (aim.screenX !== undefined || aim.screenZ !== undefined)
      ? this.screenAimToWorld(aim)
      : undefined;
    this.pendingCast = {
      skill,
      slot,
      timer: skill.castTime,
      ...(direction ? { dirX: direction.x, dirZ: direction.z } : {}),
    };
    const followThrough =
      skill.renderType === 'aoe' ||
      skill.renderType === 'ground' ||
      skill.renderType === 'buff' ||
      skill.renderType === 'summon'
        ? 0.56
        : skill.renderType === 'dash' || skill.renderType === 'teleport'
          ? 0.38
          : skill.renderType === 'flurry' || skill.renderType === 'beam'
            ? 0.6
            : 0.46;
    this.skillVisualDuration = Math.max(0.44, skill.castTime + followThrough);
    this.skillVisualElapsed = 0;
    this.skillVisualReleaseProgress = THREE.MathUtils.clamp(
      skill.castTime / this.skillVisualDuration,
      0.08,
      0.68,
    );
    this.skillVisualType = skill.renderType;
    this.skillVisualVariant = slot;
    this.skillVisualUltimate = skill.isUltimate;
    this.skillVisualCategory = skill.category;
    this.combatState = 'casting';
  }

  private advanceCast(dt: number): void {
    if (!this.pendingCast) return;
    if (this.combatState !== 'casting') {
      this.cancelPendingCast();
      return;
    }
    this.pendingCast.timer -= dt;
    if (this.pendingCast.timer > 0) return;
    const { skill, dirX, dirZ } = this.pendingCast;
    this.pendingCast = null;
    this.combatState = 'idle';
    this.releaseSkill(skill, dirX, dirZ);
  }

  private releaseSkill(skill: CastableSkill, forcedDirX?: number, forcedDirZ?: number): void {
    const position = this.controller.position;
    const hasForcedDirection = forcedDirX !== undefined && forcedDirZ !== undefined;
    const dirX = forcedDirX ?? Math.sin(this.controller.heading);
    const dirZ = forcedDirZ ?? Math.cos(this.controller.heading);
    if (hasForcedDirection) this.controller.heading = Math.atan2(dirX, dirZ);
    const source = this.skillSource();
    const scaledDamage = skill.damage * this.damageMultiplier(skill.category);
    // S15: แจ้งเจตนาโจมตี PvP ด้วยสกิล (Server ตัดสินผล — ดาเมจฝั่ง PvP เป็นค่าคงที่ของ Server)
    this.onPvpAttack?.({
      origin: position.clone(),
      forwardX: dirX,
      forwardZ: dirZ,
      kind: 'skill',
      category: skill.category,
      skillId: skill.id,
      range: this.skillTargetRange(skill),
    });
    if (skill.renderType !== 'beam' && skill.renderType !== 'flurry' && skill.renderType !== 'summon' && skill.renderType !== 'ground') {
      this.onSharedMonsterAttack?.({
        origin: position.clone(),
        forwardX: dirX,
        forwardZ: dirZ,
        kind: 'skill',
        category: skill.category,
        range: this.skillTargetRange(skill),
        ...(skill.renderType === 'aoe' || skill.renderType === 'buff'
          ? { area: Math.max(0.5, skill.radius) }
          : {}),
      });
    }

    switch (skill.renderType) {
      case 'projectile':
        this.fireProjectiles(skill, position, dirX, dirZ, scaledDamage, source);
        break;
      case 'beam':
        this.startChannel('beam', skill, dirX, dirZ, scaledDamage, source);
        break;
      case 'flurry':
        this.startChannel('flurry', skill, dirX, dirZ, scaledDamage, source);
        break;
      case 'ground':
        this.eruptGround(skill, position, dirX, dirZ, scaledDamage, source);
        break;
      case 'buff':
        this.castBuff(skill, position);
        break;
      case 'homing':
        this.fireHoming(skill, position, dirX, dirZ, scaledDamage, source);
        break;
      case 'summon':
        this.deploySummon(skill, position, dirX, dirZ, scaledDamage, source);
        break;
      case 'teleport':
        this.teleportStrike(skill, position, dirX, dirZ, scaledDamage, source);
        break;
      case 'aoe':
        this.effects.spawnShockwave(position, skill.radius, skill.color, 'earth-bending');
        if (scaledDamage > 0) {
          this.damageZone(
            position.x,
            position.z,
            skill.radius,
            scaledDamage,
            this.ccKnockback(skill.cc, skill.isUltimate ? 10 : 6),
            source,
            skill.dot,
          );
        }
        break;
      default: // dash (รวม mobility — ดาเมจ 0 = แค่เคลื่อนที่)
        this.dashStrike(skill, position, dirX, dirZ, scaledDamage, source);
    }
  }

  /** projectile — ยิงเป็นพัด hitCount นัด (single-hit = นัดเดียวเหมือนเดิม) */
  private fireProjectiles(
    skill: CastableSkill,
    position: THREE.Vector3,
    dirX: number,
    dirZ: number,
    scaledDamage: number,
    source: CombatRewardSource,
  ): void {
    const shots = Math.min(8, Math.max(1, skill.hitCount));
    const color = skill.isUltimate
      ? new THREE.Color(skill.color).lerp(new THREE.Color(0xffd45a), 0.35).getHex()
      : skill.color;
    const scale = skill.isUltimate ? 1.7 : 1;
    const perShot = scaledDamage / shots;
    const knockback = this.ccKnockback(skill.cc, 5);
    const spread = shots > 1 ? THREE.MathUtils.degToRad(9) : 0;
    const baseAngle = Math.atan2(dirX, dirZ);
    for (let i = 0; i < shots; i++) {
      const angle = baseAngle + (shots > 1 ? (i - (shots - 1) / 2) * spread : 0);
      const sx = Math.sin(angle);
      const sz = Math.cos(angle);
      const direction = new THREE.Vector3(sx, 0, sz);
      const start = new THREE.Vector3(position.x + sx * 1.2, position.y + 1.15, position.z + sz * 1.2);
      const visual = this.effects.createEnergyProjectile(start, direction, color, scale, WAVE_LIFETIME * 1000);
      this.projectiles.push({
        visual,
        originX: position.x,
        originZ: position.z,
        travelRange: this.skillTargetRange(skill),
        dirX: sx,
        dirZ: sz,
        life: WAVE_LIFETIME,
        lifetimeMs: WAVE_LIFETIME * 1000,
        radius: skill.radius,
        hit: new Set(),
        hitShips: new Set(),
        damage: perShot,
        knockback,
        source,
        ...(skill.dot ? { dot: skill.dot } : {}),
      });
      this.effects.spawnEnergyLaunch(start, direction, color, scale * 1.15);
    }
  }

  /** homing — ยิงกระสุนที่เลี้ยวเข้าหาเป้าใกล้สุด (จับเป้าใน updateProjectiles) */
  private fireHoming(
    skill: CastableSkill,
    position: THREE.Vector3,
    dirX: number,
    dirZ: number,
    scaledDamage: number,
    source: CombatRewardSource,
  ): void {
    const shots = Math.min(6, Math.max(1, skill.hitCount));
    const color = skill.isUltimate
      ? new THREE.Color(skill.color).lerp(new THREE.Color(0xffd45a), 0.35).getHex()
      : skill.color;
    const scale = skill.isUltimate ? 1.5 : 1;
    const perShot = scaledDamage / shots;
    const knockback = this.ccKnockback(skill.cc, 4);
    const baseAngle = Math.atan2(dirX, dirZ);
    for (let i = 0; i < shots; i++) {
      // กระจายออกด้านข้างตอนยิง แล้วค่อยเลี้ยวเข้าเป้า
      const angle = baseAngle + (shots > 1 ? (i - (shots - 1) / 2) * THREE.MathUtils.degToRad(16) : 0);
      const sx = Math.sin(angle);
      const sz = Math.cos(angle);
      const direction = new THREE.Vector3(sx, 0, sz);
      const start = new THREE.Vector3(position.x + sx * 1.2, position.y + 1.15, position.z + sz * 1.2);
      const visual = this.effects.createEnergyProjectile(start, direction, color, scale, WAVE_LIFETIME * 1000);
      this.projectiles.push({
        visual,
        originX: position.x,
        originZ: position.z,
        travelRange: this.skillTargetRange(skill),
        dirX: sx,
        dirZ: sz,
        life: WAVE_LIFETIME,
        lifetimeMs: WAVE_LIFETIME * 1000,
        radius: skill.radius,
        hit: new Set(),
        hitShips: new Set(),
        damage: perShot,
        knockback,
        source,
        homing: true,
        target: null,
        ...(skill.dot ? { dot: skill.dot } : {}),
      });
      this.effects.spawnEnergyLaunch(start, direction, color, scale * 1.1);
    }
  }

  /** summon — วางร่างหน้าตัวที่ยิงมอนใกล้สุดเองเป็นช่วง ๆ */
  private deploySummon(
    skill: CastableSkill,
    position: THREE.Vector3,
    dirX: number,
    dirZ: number,
    scaledDamage: number,
    source: CombatRewardSource,
  ): void {
    const dist = Math.max(1.6, skill.range * 0.4);
    const x = position.x + dirX * dist;
    const z = position.z + dirZ * dist;
    const y = position.y + 1.2;
    const visual = this.effects.createEnergyProjectile(
      new THREE.Vector3(x, y, z),
      new THREE.Vector3(dirX, 0, dirZ),
      skill.color,
      skill.isUltimate ? 1.5 : 1.1,
      (skill.isUltimate ? 9 : 6.5) * 1000,
    );
    this.summons.push({
      actorId: `summon:${++this.summonSequence}`,
      spawnSequence: this.summonSequence,
      skillId: skill.id,
      visual,
      x,
      y,
      z,
      dirX,
      dirZ,
      attackRange: this.skillTargetRange(skill),
      life: skill.isUltimate ? 9 : 6.5,
      lifetimeMs: (skill.isUltimate ? 9 : 6.5) * 1000,
      fireAcc: 0,
      fireInterval: skill.isUltimate ? 0.7 : 0.95,
      radius: skill.radius,
      damage: scaledDamage / 4, // ต่อการยิงหนึ่งครั้ง (ยิงหลายครั้งตลอดอายุ)
      acquireRange: (skill.radius > 0 ? skill.radius : 4) + 9,
      color: skill.color,
      source,
    });
    this.effects.spawnShockwave(new THREE.Vector3(x, position.y, z), 2, skill.color, 'magic-rock');
  }

  /** Presentation-only summon envelope for the parent bridge; never includes authority fields. */
  getPresentationActors(zone: string, generation: number): SharedMonsterActor[] {
    const stateSequence = ++this.presentationStateSequence;
    const active = this.summons.map((summon) => ({
      actorId: summon.actorId,
      kind: 'summon' as const,
      type: summon.skillId,
      zone,
      generation,
      spawnSequence: summon.spawnSequence,
      stateSequence,
      lifecycle: 'active' as const,
      pose: { x: summon.visual.root.position.x, y: summon.visual.root.position.y, z: summon.visual.root.position.z, heading: Math.atan2(summon.dirX, summon.dirZ) },
      locomotion: 'idle' as const,
      animation: { state: 'attack' as const },
      visual: {
        schemaVersion: 1 as const,
        sessionId: `summon-${generation}`,
        stateSequence,
        events: [],
        projectiles: [{
          id: summon.actorId,
          position: { x: summon.visual.root.position.x, y: summon.visual.root.position.y, z: summon.visual.root.position.z },
          direction: { x: summon.dirX, y: 0, z: summon.dirZ },
          velocity: { x: summon.dirX * 24, y: 0, z: summon.dirZ * 24 },
          color: summon.color,
          scale: summon.visual.scale,
          elapsed: Math.max(0, summon.lifetimeMs / 1000 - summon.life),
          lifeFraction: Math.max(0, Math.min(1, summon.life / (summon.lifetimeMs / 1000))),
          remainingMs: Math.max(0, Math.round(summon.life * 1000)),
          skillId: summon.skillId,
        }],
      },
    }));
    const ended = this.endedSummons.splice(0, 32).map((summon) => ({
      actorId: summon.actorId,
      kind: 'summon' as const,
      type: summon.type,
      zone,
      generation,
      spawnSequence: summon.spawnSequence,
      stateSequence,
      lifecycle: 'despawn' as const,
      pose: { x: summon.x, y: summon.y, z: summon.z, heading: Math.atan2(summon.dirX, summon.dirZ) },
      locomotion: 'idle' as const,
      animation: { state: 'dead' as const },
    }));
    return [...active, ...ended];
  }

  /** Reconnect/zone boundary: remove presentation-only summon handles before resync. */
  resetPresentationActors(): void {
    for (const summon of this.summons) this.effects.destroyEnergyProjectile(summon.visual);
    this.summons.length = 0;
    this.endedSummons.length = 0;
    this.presentationStateSequence = 0;
  }

  /** teleport — วาร์ปไปหลังศัตรูใกล้สุดในกรวยหน้าแล้วฟัน (ไม่เจอเป้า → พุ่งสั้น) */
  private teleportStrike(
    skill: CastableSkill,
    position: THREE.Vector3,
    dirX: number,
    dirZ: number,
    scaledDamage: number,
    source: CombatRewardSource,
  ): void {
    const target = this.nearestInCone(position, dirX, dirZ, skill.range, 0.3);
    if (!target) {
      // ไม่เจอเป้า → พุ่งสั้นไปข้างหน้าเหมือน dash
      this.controller.startDash(dirX, dirZ, Math.max(6, skill.range) / LUNGE_DURATION, LUNGE_DURATION);
      this.navalCombat?.damageNearestEnemyShipFromSkill(
        new THREE.Vector3(
          position.x + dirX * skill.range * 0.65,
          position.y,
          position.z + dirZ * skill.range * 0.65,
        ),
        Math.max(0.8, skill.radius),
        scaledDamage,
      );
      this.effects.spawnSlash(position, Math.atan2(dirX, dirZ), skill.color, 1.3);
      return;
    }
    const tp = target.group.position;
    const toX = tp.x - position.x;
    const toZ = tp.z - position.z;
    const len = Math.hypot(toX, toZ) || 1;
    const behindX = tp.x + (toX / len) * 1.7;
    const behindZ = tp.z + (toZ / len) * 1.7;
    // เอฟเฟกต์จุดออก แล้ววาร์ป
    this.effects.spawnEnergyLaunch(
      new THREE.Vector3(position.x, position.y + 1, position.z),
      new THREE.Vector3(dirX, 0, dirZ),
      skill.color,
      1,
    );
    this.controller.teleport(behindX, this.controller.position.y, behindZ);
    this.controller.heading = Math.atan2(tp.x - behindX, tp.z - behindZ);
    this.monsters.applyHit(target, scaledDamage, behindX, behindZ, this.ccKnockback(skill.cc, 5), source);
    this.navalCombat?.damageNearestEnemyShipFromSkill(
      this.controller.position,
      Math.max(0.8, skill.radius),
      scaledDamage,
    );
    if (skill.dot) this.applyDot(target, skill.dot, source);
    this.effects.spawnSlash(this.controller.position, this.controller.heading, skill.color, skill.isUltimate ? 1.8 : 1.4);
    const impact = tp.clone();
    impact.y += 1;
    this.effects.spawnEnergyImpact(impact, skill.color, 0.8);
  }

  /** มอนใกล้สุดในรัศมี (ใช้กับ homing/summon) */
  private nearestMonster(x: number, z: number, radius: number): Monster | null {
    let best: Monster | null = null;
    let bestD = Infinity;
    for (const m of this.monsters.monstersNear(x, z, radius)) {
      const d = (m.group.position.x - x) ** 2 + (m.group.position.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    return best;
  }

  /** มอนใกล้สุดในกรวยหน้า ระยะ range (ใช้กับ teleport) */
  private nearestInCone(
    position: THREE.Vector3,
    dirX: number,
    dirZ: number,
    range: number,
    arcCos: number,
  ): Monster | null {
    let best: Monster | null = null;
    let bestD = Infinity;
    for (const m of this.monsters.monstersNear(position.x, position.z, range)) {
      const dx = m.group.position.x - position.x;
      const dz = m.group.position.z - position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.001 && (dx * dirX + dz * dirZ) / dist < arcCos) continue;
      if (dist < bestD) {
        bestD = dist;
        best = m;
      }
    }
    return best;
  }

  private updateSummons(dt: number): void {
    for (let i = this.summons.length - 1; i >= 0; i--) {
      const s = this.summons[i];
      s.life -= dt;
      s.fireAcc += dt;
      s.visual.root.position.set(s.x, s.y + Math.sin(s.life * 4) * 0.15, s.z);
      this.effects.updateEnergyProjectile(s.visual, dt, Math.max(0, Math.min(1, s.life / 6)), { elapsed: Math.max(0, (s.lifetimeMs / 1000) - s.life), remainingMs: Math.max(0, s.life * 1000), direction: new THREE.Vector3(s.dirX, 0, s.dirZ) });
      if (s.fireAcc >= s.fireInterval) {
        s.fireAcc = 0;
        const target = this.nearestMonster(s.x, s.z, s.acquireRange);
        const dir = target
          ? new THREE.Vector3(
            target.group.position.x - s.x,
            0,
            target.group.position.z - s.z,
          ).normalize()
          : new THREE.Vector3(s.dirX, 0, s.dirZ);
        // Shared S16 monsters are not in MonsterManager, so a summon must
        // still emit its delayed shot intent even when no local target exists.
        this.onSharedMonsterAttack?.({
          origin: new THREE.Vector3(s.x, s.y, s.z),
          forwardX: dir.x,
          forwardZ: dir.z,
          kind: 'skill',
          category: s.source.category,
          range: s.attackRange,
        });
        if (target) {
          this.monsters.applyHit(target, s.damage, s.x, s.z, 3, s.source);
          this.effects.spawnEnergyLaunch(new THREE.Vector3(s.x, s.y, s.z), dir, s.color, 0.8);
          const impact = target.group.position.clone();
          impact.y += 1;
          this.effects.spawnEnergyImpact(impact, s.color, 0.6);
        }
        this.navalCombat?.damageNearestEnemyShipFromSkill(
          new THREE.Vector3(s.x, s.y, s.z),
          Math.max(0.8, s.radius),
          s.damage,
        );
      }
      if (s.life <= 0) {
        this.endedSummons.push({ actorId: s.actorId, spawnSequence: s.spawnSequence, skillId: s.skillId, type: s.skillId, x: s.visual.root.position.x, y: s.visual.root.position.y, z: s.visual.root.position.z, dirX: s.dirX, dirZ: s.dirZ, color: s.color });
        this.effects.destroyEnergyProjectile(s.visual);
        this.summons.splice(i, 1);
      }
    }
  }

  /** เริ่ม channel มัดรัว/ลำแสง — ล็อกท่าไว้จน tick ครบ (advanceChannel ปลดเป็น idle) */
  private startChannel(
    kind: 'flurry' | 'beam',
    skill: CastableSkill,
    dirX: number,
    dirZ: number,
    scaledDamage: number,
    source: CombatRewardSource,
  ): void {
    const hasStun = skill.cc.some((c) => c.type === 'stun');
    const totalTicks =
      kind === 'flurry'
        ? Math.max(3, Math.min(8, skill.hitCount))
        : Math.max(4, Math.min(8, skill.hitCount) + (hasStun ? 2 : 0));
    this.activeChannel = {
      kind,
      skill,
      dirX,
      dirZ,
      perTickDamage: scaledDamage / totalTicks,
      totalTicks,
      ticksDone: 0,
      tickInterval: kind === 'flurry' ? 0.11 : skill.isUltimate ? 0.1 : 0.09,
      tickAcc: 0,
      knockback: this.ccKnockback(skill.cc, kind === 'flurry' ? 2 : 1),
      color: skill.color,
      source,
    };
    this.combatState = 'casting';
    this.channelTick(); // tick แรกทันที
  }

  private advanceChannel(dt: number): void {
    const ch = this.activeChannel;
    if (!ch) return;
    ch.tickAcc += dt;
    while (ch.tickAcc >= ch.tickInterval && ch.ticksDone < ch.totalTicks) {
      ch.tickAcc -= ch.tickInterval;
      this.channelTick();
    }
    if (ch.ticksDone >= ch.totalTicks) {
      this.activeChannel = null;
      if (this.combatState === 'casting') this.combatState = 'idle';
    }
  }

  /** ฉีดดาเมจ 1 tick ของ channel */
  private channelTick(): void {
    const ch = this.activeChannel;
    if (!ch) return;
    ch.ticksDone++;
    const position = this.controller.position;
    const heading = this.controller.heading;
    const isLast = ch.ticksDone >= ch.totalTicks;

    this.onSharedMonsterAttack?.({
      origin: position.clone(),
      forwardX: ch.dirX,
      forwardZ: ch.dirZ,
      kind: 'skill',
      category: ch.source.category,
      range: ch.skill.range,
      ...(ch.kind === 'beam' ? { area: Math.max(0.5, ch.skill.radius) } : {}),
    });

    if (ch.kind === 'flurry') {
      this.monsters.playerAttack(position, heading, {
        damage: ch.perTickDamage,
        range: ch.skill.range,
        arcCos: 0.5, // กรวยหน้า ~60°
        knockback: isLast ? Math.max(ch.knockback, 6) : ch.knockback,
        source: ch.source,
        onHit: ch.skill.dot ? (m) => this.applyDot(m, ch.skill.dot!, ch.source) : undefined,
      });
      this.navalCombat?.damageNearestEnemyShipFromSkill(
        new THREE.Vector3(
          position.x + ch.dirX * ch.skill.range * 0.55,
          position.y,
          position.z + ch.dirZ * ch.skill.range * 0.55,
        ),
        Math.max(0.8, ch.skill.radius),
        ch.perTickDamage,
      );
      this.effects.spawnSlash(position, heading, ch.color, isLast ? 1.5 : 0.9, 'fire-hands');
    } else {
      // beam — sample หลายจุดตามแนวเส้นหน้าตัว
      const segs = 5;
      const damaged = new Set<Monster>();
      const damagedShips = new Set<string>();
      for (let s = 1; s <= segs; s++) {
        const d = (ch.skill.range * s) / segs;
        const px = position.x + ch.dirX * d;
        const pz = position.z + ch.dirZ * d;
        this.navalCombat?.damageNearestEnemyShipFromSkill(
          new THREE.Vector3(px, position.y, pz),
          Math.max(0.8, ch.skill.radius),
          ch.perTickDamage,
          damagedShips,
        );
        for (const m of this.monsters.monstersNear(px, pz, ch.skill.radius)) {
          if (damaged.has(m)) continue;
          damaged.add(m);
          this.monsters.applyHit(m, ch.perTickDamage, position.x, position.z, ch.knockback, ch.source);
          if (ch.skill.dot) this.applyDot(m, ch.skill.dot, ch.source);
        }
      }
      this.effects.spawnBeam(
        new THREE.Vector3(position.x + ch.dirX * 1.2, position.y + 1.15, position.z + ch.dirZ * 1.2),
        new THREE.Vector3(ch.dirX, 0, ch.dirZ),
        ch.skill.range,
        ch.color,
      );
    }
  }

  /** ground — telegraph สั้นแล้วระเบิดโซนด้านหน้า (+ทิ้ง DoT field ถ้ามีพิษ) */
  private eruptGround(
    skill: CastableSkill,
    position: THREE.Vector3,
    dirX: number,
    dirZ: number,
    scaledDamage: number,
    source: CombatRewardSource,
  ): void {
    const x = position.x + dirX * skill.range * 0.65;
    const z = position.z + dirZ * skill.range * 0.65;
    this.effects.spawnShockwave(new THREE.Vector3(x, position.y, z), skill.radius * 0.55, skill.color, 'earth-bending');
    this.pendingZones.push({
      timer: 0.32,
      x,
      z,
      radius: skill.radius,
      damage: scaledDamage,
      knockback: this.ccKnockback(skill.cc, 7),
      color: skill.color,
      source,
      ...(skill.dot ? { dot: skill.dot } : {}),
    });
  }

  private updateZones(dt: number): void {
    const pos = this.controller.position;
    for (let i = this.pendingZones.length - 1; i >= 0; i--) {
      const zone = this.pendingZones[i];
      zone.timer -= dt;
      if (zone.timer > 0) continue;
      this.effects.spawnShockwave(new THREE.Vector3(zone.x, pos.y, zone.z), zone.radius, zone.color);
      if (zone.damage > 0) {
        this.damageZone(zone.x, zone.z, zone.radius, zone.damage, zone.knockback, zone.source, zone.dot);
        this.onSharedMonsterAttack?.({
          origin: new THREE.Vector3(zone.x, pos.y, zone.z),
          forwardX: 0,
          forwardZ: 1,
          kind: 'skill',
          category: zone.source.category,
          range: zone.radius,
          area: zone.radius,
        });
      }
      if (zone.dot) {
        this.dotFields.push({
          x: zone.x,
          z: zone.z,
          radius: zone.radius,
          dps: zone.dot.dps,
          remaining: zone.dot.duration,
          tickAcc: 0,
          color: zone.color,
          source: zone.source,
        });
      }
      this.pendingZones.splice(i, 1);
    }
    // DoT field ค้างพื้น (พิษ/ไฟ) — มอนที่อยู่ในโซนโดน tick
    for (let i = this.dotFields.length - 1; i >= 0; i--) {
      const field = this.dotFields[i];
      field.remaining -= dt;
      field.tickAcc += dt;
      if (field.tickAcc >= 0.5) {
        const tickDmg = field.dps * field.tickAcc;
        field.tickAcc = 0;
        for (const m of this.monsters.monstersNear(field.x, field.z, field.radius)) {
          this.monsters.applyHit(m, tickDmg, field.x, field.z, 0, field.source);
        }
        // Persistent elemental fields affect ships on the same cadence as monsters.
        // The original cast damaged a ship once, but subsequent DoT ticks were PvE-only.
        this.navalCombat?.damageNearestEnemyShipFromSkill(
          new THREE.Vector3(field.x, pos.y, field.z),
          field.radius,
          tickDmg,
        );
        this.onSharedMonsterAttack?.({
          origin: new THREE.Vector3(field.x, pos.y, field.z),
          forwardX: 0,
          forwardZ: 1,
          kind: 'skill',
          category: field.source.category,
          range: field.radius,
          area: field.radius,
        });
      }
      if (field.remaining <= 0) this.dotFields.splice(i, 1);
    }
  }

  /** buff/heal — ฮีล + คืน MP + บัฟดาเมจชั่วคราว */
  private castBuff(skill: CastableSkill, position: THREE.Vector3): void {
    const healHp = this.controller.hpMax * (skill.isUltimate ? 0.22 : 0.12);
    const appliedHeal = this.authoritativeCombatTimer > 0 ? 0 : healHp;
    this.controller.hp = Math.min(this.controller.hpMax, this.controller.hp + appliedHeal);
    // คืน MP (ทรัพยากรสกิล) แทน Energy
    this.controller.mp = Math.min(
      this.controller.mpMax,
      this.controller.mp + (skill.isUltimate ? 30 : 18),
    );
    this.skillBuffMultiplier = skill.isUltimate ? 1.4 : 1.25;
    this.skillBuffTimer = 8;
    this.effects.spawnShockwave(position, skill.radius > 0 ? skill.radius : 3, skill.color);
    this.touch?.notify(
      `✨ บัฟ! ดาเมจ x${this.skillBuffMultiplier.toFixed(2)} · ฮีล +${Math.round(appliedHeal)}`,
    );
  }

  /** dash พุ่งฟัน (+DoT ถ้ามี) */
  private dashStrike(
    skill: CastableSkill,
    position: THREE.Vector3,
    dirX: number,
    dirZ: number,
    scaledDamage: number,
    source: CombatRewardSource,
  ): void {
    this.controller.startDash(dirX, dirZ, skill.range / LUNGE_DURATION, LUNGE_DURATION);
    const samplePoint = new THREE.Vector3();
    const damaged = new Set<Monster>();
    const damagedShips = new Set<string>();
    const knockback = this.ccKnockback(skill.cc, 6);
    for (let step = 0; scaledDamage > 0 && step <= 3; step++) {
      samplePoint.set(
        position.x + (dirX * skill.range * step) / 3,
        position.y,
        position.z + (dirZ * skill.range * step) / 3,
      );
      this.navalCombat?.damageNearestEnemyShipFromSkill(
        samplePoint,
        Math.max(0.8, skill.radius),
        scaledDamage,
        damagedShips,
      );
      for (const monster of this.monsters.monstersNear(samplePoint.x, samplePoint.z, skill.radius)) {
        if (damaged.has(monster)) continue;
        damaged.add(monster);
        this.monsters.applyHit(monster, scaledDamage, position.x, position.z, knockback, source);
        if (skill.dot) this.applyDot(monster, skill.dot, source);
      }
    }
    this.effects.spawnSlash(position, Math.atan2(dirX, dirZ), 0xffe27a, skill.isUltimate ? 1.9 : 1.5);
  }

  /** ดาเมจทุกตัวในโซน + ติด DoT ถ้ามี (แทน damageRadius เพื่อรองรับพิษ) */
  private damageZone(
    x: number,
    z: number,
    radius: number,
    damage: number,
    knockback: number,
    source: CombatRewardSource,
    dot?: DotSpec,
  ): void {
    this.navalCombat?.damageNearestEnemyShipFromSkill(new THREE.Vector3(x, this.controller.position.y, z), radius, damage);
    for (const monster of this.monsters.monstersNear(x, z, radius)) {
      this.monsters.applyHit(monster, damage, x, z, knockback, source);
      if (dot) this.applyDot(monster, dot, source);
    }
  }

  /** ลง/รีเฟรช DoT ติดตัวมอนสเตอร์ */
  private applyDot(monster: Monster, dot: DotSpec, source: CombatRewardSource): void {
    const existing = this.activeDots.find((d) => d.monster === monster);
    if (existing) {
      existing.remaining = Math.max(existing.remaining, dot.duration);
      existing.dps = Math.max(existing.dps, dot.dps);
    } else {
      this.activeDots.push({ monster, dps: dot.dps, remaining: dot.duration, tickAcc: 0, source });
    }
  }

  private updateDots(dt: number): void {
    for (let i = this.activeDots.length - 1; i >= 0; i--) {
      const d = this.activeDots[i];
      if (!d.monster.alive) {
        this.activeDots.splice(i, 1);
        continue;
      }
      d.remaining -= dt;
      d.tickAcc += dt;
      if (d.tickAcc >= 0.5) {
        const p = d.monster.group.position;
        this.monsters.applyHit(d.monster, d.dps * d.tickAcc, p.x, p.z, 0, d.source);
        d.tickAcc = 0;
      }
      if (d.remaining <= 0) this.activeDots.splice(i, 1);
    }
  }

  /** แปลง cc → แรง knockback ที่ส่งเข้า applyHit (stun/pull/slow ยังไม่มีผลกับมอน) */
  private ccKnockback(cc: CcSpec[], base: number): number {
    let kb = base;
    for (const c of cc) {
      if (c.type === 'knockback' || c.type === 'launch') kb = Math.max(kb, c.power);
    }
    return kb;
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const wave = this.projectiles[i];
      wave.life -= dt;
      // homing: จับเป้าใกล้สุดแล้วค่อย ๆ เลี้ยวทิศเข้าหา
      if (wave.homing) {
        if (!wave.target || !wave.target.alive) {
          wave.target = this.nearestMonster(wave.originX, wave.originZ, wave.travelRange);
        }
        if (wave.target) {
          const tx = wave.target.group.position.x - wave.visual.root.position.x;
          const tz = wave.target.group.position.z - wave.visual.root.position.z;
          const len = Math.hypot(tx, tz) || 1;
          const turn = Math.min(1, 4 * dt);
          wave.dirX += (tx / len - wave.dirX) * turn;
          wave.dirZ += (tz / len - wave.dirZ) * turn;
          const dl = Math.hypot(wave.dirX, wave.dirZ) || 1;
          wave.dirX /= dl;
          wave.dirZ /= dl;
        }
      }
      wave.visual.root.position.x += wave.dirX * WAVE_SPEED * dt;
      wave.visual.root.position.z += wave.dirZ * WAVE_SPEED * dt;
      this.effects.updateEnergyProjectile(wave.visual, dt, wave.life / WAVE_LIFETIME, { elapsed: Math.max(0, WAVE_LIFETIME - wave.life), remainingMs: Math.max(0, wave.life * 1000), direction: new THREE.Vector3(wave.dirX, 0, wave.dirZ) });

      // สกิลยิงออกจากดาดฟ้าโดนเรือได้เช่นเดียวกับโดนมอนสเตอร์
      this.navalCombat?.damageNearestEnemyShipFromSkill(
        wave.visual.root.position,
        Math.max(0.8, wave.radius),
        wave.damage,
        wave.hitShips,
      );

      for (const monster of this.monsters.monstersNear(
        wave.visual.root.position.x,
        wave.visual.root.position.z,
        wave.radius,
      )) {
        if (wave.hit.has(monster)) continue;
        wave.hit.add(monster);
        this.monsters.applyHit(
          monster,
          wave.damage,
          wave.visual.root.position.x - wave.dirX,
          wave.visual.root.position.z - wave.dirZ,
          wave.knockback,
          wave.source,
        );
        if (wave.dot) this.applyDot(monster, wave.dot, wave.source);
        const impactPosition = monster.group.position.clone();
        impactPosition.y += monster.type.kind === 'crab' ? 0.65 : 1.05 * monster.type.scale;
        this.effects.spawnEnergyImpact(
          impactPosition,
          wave.visual.color,
          wave.visual.scale * 0.7,
        );
      }

      const travelled = Math.hypot(
        wave.visual.root.position.x - wave.originX,
        wave.visual.root.position.z - wave.originZ,
      );
      if (wave.life <= 0 || travelled >= wave.travelRange) {
        this.effects.destroyEnergyProjectile(wave.visual);
        this.projectiles.splice(i, 1);
      }
    }
  }

  private damageMultiplier(category: LoadoutCategory): number {
    const base = this.progression?.getDamageMultiplier(category) ?? 1;
    // บัฟชั่วคราวจากสกิล buff — คูณดาเมจทุกท่าระหว่างเปิดใช้
    return base * (this.skillBuffTimer > 0 ? this.skillBuffMultiplier : 1);
  }

  /** Keep client target selection bounded by the actual skill shape. */
  private skillTargetRange(skill: CastableSkill): number {
    if (skill.renderType === 'aoe' || skill.renderType === 'buff') {
      return Math.max(0.8, skill.radius);
    }
    return Math.max(0.8, skill.range);
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
    const info = this.set.slotInfo;
    // ไอคอนจาก databook — โชว์แม้ยังล็อก (ผู้เล่นเห็นท่าที่รอปลด)
    this.touch.setSkillIcons([info[0].icon, info[1].icon, info[2].icon]);
    this.touch.setUltimateIcon(info[3].hasSkill ? info[3].icon : '🔒');
    // ปุ่มอาวุธแสดงไอคอนของชุดสกิลที่ active (อาวุธ หรือ ผลไม้)
    this.touch.setWeaponIcon(this.set.itemIcon);
    // ล็อกตาม mastery จริงต่อชิ้น — ปุ่มที่ยังไม่ปลดโชว์ 🔒{เกณฑ์}
    const mastery = this.currentItemMastery();
    this.touch.setSkillMasteryState(mastery, [
      info[0].locked ? info[0].masteryRequired : 0,
      info[1].locked ? info[1].masteryRequired : 0,
      info[2].locked ? info[2].masteryRequired : 0,
    ]);
    this.touch.setUltimateMastery(info[3].locked && info[3].hasSkill ? info[3].masteryRequired : 0);
  }

  /** id ของไอเทมที่ชุดสกิล active อ้างถึง (อาวุธ/ผลไม้) */
  private activeSkillItemId(): string {
    return this.set.itemId ?? this.set.weaponId ?? 'combat';
  }

  /** mastery ปัจจุบันของไอเทมที่ active — provider progression ก่อน */
  private currentItemMastery(): number {
    return this.progression?.getMasteryLevel(this.activeSkillItemId()) ?? 1;
  }
}
