import {
  PVP_ATTACK_MIN_INTERVAL_MS,
  PVP_MAX_HP,
  PVP_MELEE_DAMAGE,
  PVP_MELEE_KNOCKBACK_DURATION,
  PVP_MELEE_KNOCKBACK_SPEED,
  PVP_MELEE_HITSTUN_DURATION,
  PVP_MELEE_RANGE,
  PVP_RESPAWN_MS,
  PVP_SKILL_DAMAGE,
  PVP_SKILL_KNOCKBACK_DURATION,
  PVP_SKILL_KNOCKBACK_SPEED,
  PVP_SKILL_HITSTUN_DURATION,
  PVP_SKILL_RANGE,
} from '@pirate-fruit/shared';
import type { RealtimeCombatRejectReason, RealtimeKnockback } from '@pirate-fruit/shared';

/**
 * S15 — Multiplayer Combat Authority (PvP)
 * แหล่งความจริงเดียวของ HP การต่อสู้ระหว่างผู้เล่น: Client ส่งได้แค่ "เจตนาโจมตี"
 * ส่วนดาเมจ/HP/ตาย/เกิดใหม่ คิดที่นี่ล้วน — ค่าจาก Client ไม่มีผล (กันโกง)
 *
 * เป็นคลาส pure (ไม่รู้จัก socket): รับตำแหน่งจาก presence ของ hub เข้ามาเป็นพารามฯ
 * → ทดสอบง่าย. HP เป็น ephemeral ต่อ session (ไม่ persist) — ตัดการเชื่อมต่อ = ลบทิ้ง
 */

export interface CombatPosition {
  x: number;
  y: number;
  z: number;
}

interface CombatState {
  hp: number;
  /** null = ยังไม่ตาย; ตัวเลข = เวลาที่จะเกิดใหม่ (ms) */
  respawnAt: number | null;
  /** Server-authoritative hit-stun window; prevents immediate counterattacks. */
  hitstunUntil: number;
  /** เวลาโจมตีล่าสุดต่อเป้าแต่ละคน — กันสแปม/ออโต้ยิงรัว */
  lastAttackAt: Map<string, number>;
  /** Client action ids already consumed by Server; prevents replay from dealing damage twice. */
  processedIntentIds: Map<string, number>;
  blocking: boolean;
  guard: number;
  lastGuardAt: number;
}

export type AttackKind = 'melee' | 'skill';

export interface AttackResolution {
  damage: number;
  /** HP เป้าหลังโดน */
  hp: number;
  maxHp: number;
  /** true = เป้า HP หมด (แพ้) — ตั้งเวลาเกิดใหม่ไว้แล้ว */
  defeated: boolean;
  /** Server-computed presentation impulse; Client cannot choose its direction or size. */
  knockback?: RealtimeKnockback;
  blocked?: boolean;
  guardBroken?: boolean;
}

export type AttackDecision =
  | { accepted: true; resolution: AttackResolution }
  | { accepted: false; reason: Extract<RealtimeCombatRejectReason,
      'self-target' | 'presence-required' | 'defeated' | 'stunned' | 'duplicate' | 'cooldown' | 'out-of-range'> };

export interface RespawnEvent {
  playerId: string;
  hp: number;
  maxHp: number;
}

function damageFor(kind: AttackKind): number {
  return kind === 'skill' ? PVP_SKILL_DAMAGE : PVP_MELEE_DAMAGE;
}

const ATTACK_INTENT_TTL_MS = 30_000;
const MAX_PROCESSED_ATTACK_INTENTS = 256;
const PVP_GUARD_MAX = 100;
const PVP_GUARD_REGEN_PER_SECOND = 18;
const PVP_BLOCK_DAMAGE_RATIO = 0.25;

function rangeFor(kind: AttackKind): number {
  return kind === 'skill' ? PVP_SKILL_RANGE : PVP_MELEE_RANGE;
}

function knockbackFor(
  attacker: CombatPosition,
  target: CombatPosition,
  kind: AttackKind,
  defeated: boolean,
): RealtimeKnockback | undefined {
  if (defeated) return undefined;
  const dx = target.x - attacker.x;
  const dz = target.z - attacker.z;
  const length = Math.hypot(dx, dz) || 1;
  return {
    directionX: dx / length,
    directionZ: dz / length,
    speed: kind === 'skill' ? PVP_SKILL_KNOCKBACK_SPEED : PVP_MELEE_KNOCKBACK_SPEED,
    duration: kind === 'skill' ? PVP_SKILL_KNOCKBACK_DURATION : PVP_MELEE_KNOCKBACK_DURATION,
    stunDuration: kind === 'skill' ? PVP_SKILL_HITSTUN_DURATION : PVP_MELEE_HITSTUN_DURATION,
  };
}

export class CombatAuthority {
  private readonly states = new Map<string, CombatState>();

  get maxHp(): number {
    return PVP_MAX_HP;
  }

  /** ผู้เล่นเข้าร่วม — เริ่มด้วย HP เต็ม (idempotent) */
  ensure(playerId: string): void {
    if (!this.states.has(playerId)) {
      this.states.set(playerId, {
        hp: PVP_MAX_HP,
        respawnAt: null,
        hitstunUntil: 0,
        lastAttackAt: new Map(),
        processedIntentIds: new Map(),
        blocking: false,
        guard: PVP_GUARD_MAX,
        lastGuardAt: 0,
      });
    }
  }

  /** ตัดการเชื่อมต่อ → ลบสถานะ + ลบ throttle ที่คนอื่นมีต่อผู้เล่นนี้ */
  remove(playerId: string): void {
    this.states.delete(playerId);
    for (const state of this.states.values()) state.lastAttackAt.delete(playerId);
  }

  /** HP ปัจจุบัน (ทดสอบ/แสดงผล) — undefined = ไม่รู้จัก */
  hpOf(playerId: string): number | undefined {
    return this.states.get(playerId)?.hp;
  }

  isAlive(playerId: string): boolean {
    const state = this.states.get(playerId);
    return Boolean(state && state.respawnAt === null);
  }

  setBlocking(playerId: string, active: boolean, now: number): void {
    this.ensure(playerId);
    const state = this.states.get(playerId)!;
    this.refreshGuard(state, now);
    state.blocking = active && state.respawnAt === null && state.guard > 0 && state.hitstunUntil <= now;
  }

  /**
   * ตัดสินการโจมตี — คืน resolution ถ้าโดนจริง, คืน null ถ้าปัดตก (นอกระยะ/คูลดาวน์/
   * เป้าตายแล้ว/ตัวเอง/ไม่รู้จัก). ไม่ถือเป็น protocol violation — แค่เพิกเฉย
   */
  resolveAttack(
    now: number,
    attackerId: string,
    attackerPos: CombatPosition | null,
    targetId: string,
    targetPos: CombatPosition | null,
    kind: AttackKind,
  ): AttackResolution | null {
    const decision = this.resolveAttackDetailed(now, attackerId, attackerPos, targetId, targetPos, kind);
    return decision.accepted ? decision.resolution : null;
  }

  resolveAttackDetailed(
    now: number,
    attackerId: string,
    attackerPos: CombatPosition | null,
    targetId: string,
    targetPos: CombatPosition | null,
    kind: AttackKind,
    intentId?: string,
  ): AttackDecision {
    if (attackerId === targetId) return { accepted: false, reason: 'self-target' };
    if (!attackerPos || !targetPos) return { accepted: false, reason: 'presence-required' };
    this.ensure(attackerId);
    this.ensure(targetId);
    const attacker = this.states.get(attackerId)!;
    const target = this.states.get(targetId)!;
    if (intentId && !this.claimIntent(attacker, intentId, now)) {
      return { accepted: false, reason: 'duplicate' };
    }
    // ผู้โจมตีต้องยังไม่ตาย และเป้าต้องยังไม่ตาย
    if (attacker.respawnAt !== null || target.respawnAt !== null) {
      return { accepted: false, reason: 'defeated' };
    }
    if (attacker.hitstunUntil > now) return { accepted: false, reason: 'stunned' };

    // A new action may refresh the target's stun for a real combo. Cooldown and
    // intent de-duplication still guarantee at most one hit per action cadence.
    const lastAt = attacker.lastAttackAt.get(targetId) ?? -Infinity;
    if (now - lastAt < PVP_ATTACK_MIN_INTERVAL_MS) return { accepted: false, reason: 'cooldown' };

    // ระยะ: วัดจาก presence ล่าสุดของทั้งคู่ (Server เป็นคนรู้ตำแหน่ง ไม่ใช่ Client)
    const dx = attackerPos.x - targetPos.x;
    const dy = attackerPos.y - targetPos.y;
    const dz = attackerPos.z - targetPos.z;
    const range = rangeFor(kind);
    if (dx * dx + dy * dy + dz * dz > range * range) return { accepted: false, reason: 'out-of-range' };

    attacker.lastAttackAt.set(targetId, now);
    this.refreshGuard(target, now);
    const baseDamage = damageFor(kind);
    const blocked = target.blocking && target.guard > 0;
    const damage = blocked ? Math.max(1, Math.ceil(baseDamage * PVP_BLOCK_DAMAGE_RATIO)) : baseDamage;
    let guardBroken = false;
    if (blocked) {
      target.guard = Math.max(0, target.guard - baseDamage);
      guardBroken = target.guard <= 0;
      if (guardBroken) target.blocking = false;
    }
    target.hp = Math.max(0, target.hp - damage);
    const defeated = target.hp <= 0;
    if (defeated) target.respawnAt = now + PVP_RESPAWN_MS;
    const knockback = knockbackFor(attackerPos, targetPos, kind, defeated);
    if (knockback) {
      const stunDuration = knockback.stunDuration ?? knockback.duration;
      target.hitstunUntil = Math.max(target.hitstunUntil, now + stunDuration * 1_000);
      if (guardBroken) target.hitstunUntil = Math.max(target.hitstunUntil, now + 700);
    }
    return {
      accepted: true,
      resolution: {
        damage,
        hp: target.hp,
        maxHp: PVP_MAX_HP,
        defeated,
        knockback,
        blocked,
        guardBroken,
      },
    };
  }

  private claimIntent(state: CombatState, intentId: string, now: number): boolean {
    const cutoff = now - ATTACK_INTENT_TTL_MS;
    for (const [id, seenAt] of state.processedIntentIds) {
      if (seenAt < cutoff) state.processedIntentIds.delete(id);
    }
    if (state.processedIntentIds.has(intentId)) return false;
    state.processedIntentIds.set(intentId, now);
    while (state.processedIntentIds.size > MAX_PROCESSED_ATTACK_INTENTS) {
      const oldest = state.processedIntentIds.keys().next().value;
      if (typeof oldest !== 'string') break;
      state.processedIntentIds.delete(oldest);
    }
    return true;
  }

  private refreshGuard(state: CombatState, now: number): void {
    const elapsed = state.lastGuardAt > 0 ? Math.max(0, now - state.lastGuardAt) : 0;
    state.lastGuardAt = now;
    if (!state.blocking && state.guard < PVP_GUARD_MAX) {
      state.guard = Math.min(PVP_GUARD_MAX, state.guard + elapsed * PVP_GUARD_REGEN_PER_SECOND / 1_000);
    }
  }

  /** ถึงเวลาเกิดใหม่ของใครบ้าง → รีเซ็ต HP เต็มแล้วคืนรายการเพื่อ broadcast */
  collectRespawns(now: number): RespawnEvent[] {
    const respawned: RespawnEvent[] = [];
    for (const [playerId, state] of this.states) {
      if (state.respawnAt !== null && now >= state.respawnAt) {
        state.hp = PVP_MAX_HP;
        state.respawnAt = null;
        state.hitstunUntil = 0;
        state.blocking = false;
        state.guard = PVP_GUARD_MAX;
        state.lastGuardAt = now;
        state.lastAttackAt.clear();
        respawned.push({ playerId, hp: PVP_MAX_HP, maxHp: PVP_MAX_HP });
      }
    }
    return respawned;
  }
}
