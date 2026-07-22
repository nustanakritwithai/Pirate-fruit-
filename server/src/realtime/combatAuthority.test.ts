import { describe, expect, it } from 'vitest';
import {
  PVP_ATTACK_MIN_INTERVAL_MS,
  PVP_MAX_HP,
  PVP_MELEE_DAMAGE,
  PVP_MELEE_KNOCKBACK_DURATION,
  PVP_MELEE_HITSTUN_DURATION,
  PVP_MELEE_KNOCKBACK_SPEED,
  PVP_MELEE_RANGE,
  PVP_RESPAWN_MS,
  PVP_SKILL_DAMAGE,
  PVP_SKILL_KNOCKBACK_SPEED,
} from '@pirate-fruit/shared';
import { CombatAuthority } from './combatAuthority.js';

const near = { x: 0, y: 0, z: 0 };
const near2 = { x: 1, y: 0, z: 1 };
const far = { x: 100, y: 0, z: 100 };

describe('S15 CombatAuthority', () => {
  it('applies server-side melee damage and reports authoritative hp', () => {
    const combat = new CombatAuthority();
    const result = combat.resolveAttack(1_000, 'a', near, 'b', near2, 'melee');
    expect(result).toMatchObject({
      damage: PVP_MELEE_DAMAGE,
      hp: PVP_MAX_HP - PVP_MELEE_DAMAGE,
      maxHp: PVP_MAX_HP,
      defeated: false,
      knockback: {
        directionX: expect.closeTo(1 / Math.sqrt(2), 6),
        directionZ: expect.closeTo(1 / Math.sqrt(2), 6),
        speed: PVP_MELEE_KNOCKBACK_SPEED,
        duration: PVP_MELEE_KNOCKBACK_DURATION,
      },
    });
    expect(combat.hpOf('b')).toBe(PVP_MAX_HP - PVP_MELEE_DAMAGE);
  });

  it('uses a higher fixed damage for skill attacks (client cannot set damage)', () => {
    const combat = new CombatAuthority();
    const result = combat.resolveAttack(1_000, 'a', near, 'b', near2, 'skill');
    expect(result).toMatchObject({ damage: PVP_SKILL_DAMAGE, knockback: { speed: PVP_SKILL_KNOCKBACK_SPEED } });
  });

  it('rejects attacks out of range, on self, and on the dead', () => {
    const combat = new CombatAuthority();
    expect(combat.resolveAttack(1_000, 'a', near, 'b', far, 'melee')).toBeNull();
    expect(combat.resolveAttack(1_000, 'a', near, 'a', near, 'melee')).toBeNull();
    expect(combat.resolveAttack(1_000, 'a', null, 'b', near2, 'melee')).toBeNull();
  });

  it('allows unique combo actions to refresh stun while rejecting cooldown and replay', () => {
    const combat = new CombatAuthority();
    expect(combat.resolveAttackDetailed(1_000, 'a', near, 'b', near2, 'melee', 'combo-1').accepted).toBe(true);
    // เร็วเกินไป → ทิ้ง
    expect(combat.resolveAttackDetailed(
      1_000 + PVP_ATTACK_MIN_INTERVAL_MS - 1, 'a', near, 'b', near2, 'melee', 'combo-too-fast',
    )).toMatchObject({ accepted: false, reason: 'cooldown' });
    // action ใหม่หลังคูลดาวน์เข้าได้แม้เป้ายัง stun และต่อเวลา stun จาก hit ล่าสุด
    expect(combat.resolveAttackDetailed(
      1_000 + PVP_ATTACK_MIN_INTERVAL_MS, 'a', near, 'b', near2, 'melee', 'combo-2',
    ).accepted).toBe(true);
    const hpAfterCombo = combat.hpOf('b');
    // replay action เดิมไม่ลด HP รอบสอง แม้เวลาผ่านคูลดาวน์
    expect(combat.resolveAttackDetailed(
      1_000 + PVP_ATTACK_MIN_INTERVAL_MS * 2, 'a', near, 'b', near2, 'melee', 'combo-2',
    )).toMatchObject({ accepted: false, reason: 'duplicate' });
    expect(combat.hpOf('b')).toBe(hpAfterCombo);

    // เป้ายังสวนไม่ได้จนกว่าจะครบ 0.8 วินาทีจาก combo hit ล่าสุด
    expect(combat.resolveAttack(
      1_000 + PVP_ATTACK_MIN_INTERVAL_MS + PVP_MELEE_HITSTUN_DURATION * 1_000 - 1,
      'b', near2, 'a', near, 'melee',
    )).toBeNull();
    expect(combat.resolveAttack(
      1_000 + PVP_ATTACK_MIN_INTERVAL_MS + PVP_MELEE_HITSTUN_DURATION * 1_000,
      'b', near2, 'a', near, 'melee',
    )).not.toBeNull();
  });

  it('keeps a hit target in a short authoritative hit-stun window', () => {
    const combat = new CombatAuthority();
    expect(combat.resolveAttack(1_000, 'a', near, 'b', near2, 'melee')).not.toBeNull();
    expect(
      combat.resolveAttack(
        1_000 + PVP_MELEE_HITSTUN_DURATION * 1_000 - 1,
        'b',
        near2,
        'a',
        near,
        'melee',
      ),
    ).toBeNull();
    expect(
      combat.resolveAttack(
        1_000 + PVP_MELEE_HITSTUN_DURATION * 1_000,
        'b',
        near2,
        'a',
        near,
        'melee',
      ),
    ).not.toBeNull();
  });

  it('defeats a target at 0 hp and respawns full after the delay', () => {
    const combat = new CombatAuthority();
    let now = 0;
    let last: ReturnType<CombatAuthority['resolveAttack']> = null;
    // ตีจนตาย (เว้นระยะคูลดาวน์)
    for (let i = 0; i < Math.ceil(PVP_MAX_HP / PVP_MELEE_DAMAGE); i += 1) {
      last = combat.resolveAttack(now, 'a', near, 'b', near2, 'melee') ?? last;
      now += Math.max(PVP_MELEE_HITSTUN_DURATION * 1_000, PVP_ATTACK_MIN_INTERVAL_MS);
    }
    expect(last?.defeated).toBe(true);
    expect(combat.isAlive('b')).toBe(false);
    // โจมตีเป้าที่ตายแล้ว = ทิ้ง
    expect(combat.resolveAttack(now, 'a', near, 'b', near2, 'melee')).toBeNull();
    // ยังไม่ถึงเวลาเกิดใหม่
    expect(combat.collectRespawns(now)).toHaveLength(0);
    const respawns = combat.collectRespawns(now + PVP_RESPAWN_MS);
    expect(respawns).toEqual([{ playerId: 'b', hp: PVP_MAX_HP, maxHp: PVP_MAX_HP }]);
    expect(combat.isAlive('b')).toBe(true);
    expect(combat.hpOf('b')).toBe(PVP_MAX_HP);
  });

  it('reports melee range boundary correctly', () => {
    const combat = new CombatAuthority();
    const edge = { x: PVP_MELEE_RANGE, y: 0, z: 0 };
    expect(combat.resolveAttack(1_000, 'a', near, 'b', edge, 'melee')).not.toBeNull();
    const past = { x: PVP_MELEE_RANGE + 0.01, y: 0, z: 0 };
    expect(combat.resolveAttack(2_000, 'a', near, 'c', past, 'melee')).toBeNull();
  });

  it('clears state on disconnect', () => {
    const combat = new CombatAuthority();
    combat.resolveAttack(1_000, 'a', near, 'b', near2, 'melee');
    combat.remove('b');
    expect(combat.hpOf('b')).toBeUndefined();
  });
});
