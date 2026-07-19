import {
  PVP_ATTACK_MIN_INTERVAL_MS,
  PVP_MAX_HP,
  PVP_MELEE_DAMAGE,
  PVP_MELEE_RANGE,
  PVP_RESPAWN_MS,
  PVP_SKILL_DAMAGE,
  PVP_SKILL_RANGE,
} from '@pirate-fruit/shared';
import type { RealtimeCombatRejectReason } from '@pirate-fruit/shared';

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
  /** เวลาโจมตีล่าสุดต่อเป้าแต่ละคน — กันสแปม/ออโต้ยิงรัว */
  lastAttackAt: Map<string, number>;
}

export type AttackKind = 'melee' | 'skill';

export interface AttackResolution {
  damage: number;
  /** HP เป้าหลังโดน */
  hp: number;
  maxHp: number;
  /** true = เป้า HP หมด (แพ้) — ตั้งเวลาเกิดใหม่ไว้แล้ว */
  defeated: boolean;
}

export type AttackDecision =
  | { accepted: true; resolution: AttackResolution }
  | { accepted: false; reason: Extract<RealtimeCombatRejectReason,
      'self-target' | 'presence-required' | 'defeated' | 'cooldown' | 'out-of-range'> };

export interface RespawnEvent {
  playerId: string;
  hp: number;
  maxHp: number;
}

function damageFor(kind: AttackKind): number {
  return kind === 'skill' ? PVP_SKILL_DAMAGE : PVP_MELEE_DAMAGE;
}

function rangeFor(kind: AttackKind): number {
  return kind === 'skill' ? PVP_SKILL_RANGE : PVP_MELEE_RANGE;
}

export class CombatAuthority {
  private readonly states = new Map<string, CombatState>();

  get maxHp(): number {
    return PVP_MAX_HP;
  }

  /** ผู้เล่นเข้าร่วม — เริ่มด้วย HP เต็ม (idempotent) */
  ensure(playerId: string): void {
    if (!this.states.has(playerId)) {
      this.states.set(playerId, { hp: PVP_MAX_HP, respawnAt: null, lastAttackAt: new Map() });
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
  ): AttackDecision {
    if (attackerId === targetId) return { accepted: false, reason: 'self-target' };
    if (!attackerPos || !targetPos) return { accepted: false, reason: 'presence-required' };
    this.ensure(attackerId);
    this.ensure(targetId);
    const attacker = this.states.get(attackerId)!;
    const target = this.states.get(targetId)!;
    // ผู้โจมตีต้องยังไม่ตาย และเป้าต้องยังไม่ตาย
    if (attacker.respawnAt !== null || target.respawnAt !== null) {
      return { accepted: false, reason: 'defeated' };
    }

    // throttle: โจมตีเป้าเดิมถี่เกินไป = ทิ้ง (กันออโต้)
    const lastAt = attacker.lastAttackAt.get(targetId) ?? -Infinity;
    if (now - lastAt < PVP_ATTACK_MIN_INTERVAL_MS) return { accepted: false, reason: 'cooldown' };

    // ระยะ: วัดจาก presence ล่าสุดของทั้งคู่ (Server เป็นคนรู้ตำแหน่ง ไม่ใช่ Client)
    const dx = attackerPos.x - targetPos.x;
    const dy = attackerPos.y - targetPos.y;
    const dz = attackerPos.z - targetPos.z;
    const range = rangeFor(kind);
    if (dx * dx + dy * dy + dz * dz > range * range) return { accepted: false, reason: 'out-of-range' };

    attacker.lastAttackAt.set(targetId, now);
    const damage = damageFor(kind);
    target.hp = Math.max(0, target.hp - damage);
    const defeated = target.hp <= 0;
    if (defeated) target.respawnAt = now + PVP_RESPAWN_MS;
    return { accepted: true, resolution: { damage, hp: target.hp, maxHp: PVP_MAX_HP, defeated } };
  }

  /** ถึงเวลาเกิดใหม่ของใครบ้าง → รีเซ็ต HP เต็มแล้วคืนรายการเพื่อ broadcast */
  collectRespawns(now: number): RespawnEvent[] {
    const respawned: RespawnEvent[] = [];
    for (const [playerId, state] of this.states) {
      if (state.respawnAt !== null && now >= state.respawnAt) {
        state.hp = PVP_MAX_HP;
        state.respawnAt = null;
        state.lastAttackAt.clear();
        respawned.push({ playerId, hp: PVP_MAX_HP, maxHp: PVP_MAX_HP });
      }
    }
    return respawned;
  }
}
