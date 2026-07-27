import { describe, expect, it } from 'vitest';
import {
  aimCannonball,
  CANNONBALL_LIFETIME,
  CANNONBALL_SPEED,
  decideShipState,
  PIRATE_BRIG,
  PIRATE_CUTTER,
  PIRATE_GALLEON,
  PIRATE_SKIFF,
  PIRATE_SHIP_TIERS,
  PIRATE_SPAWNS,
  resolveBroadsideCommand,
  steerToward,
  stepCannonball,
  type CannonballState,
} from '../NavalData';
import { WATER_LEVEL } from '../../ocean/Ocean';

function makeBall(from: { x: number; y: number; z: number }, target: { x: number; z: number }): CannonballState {
  const v = aimCannonball(from.x, from.y, from.z, target.x, target.z);
  return { ...from, vx: v.vx, vy: v.vy, vz: v.vz, life: CANNONBALL_LIFETIME };
}

describe('NavalData — วิถีกระสุนปืนใหญ่', () => {
  it('เล็งแนวราบตรงทิศเป้า ด้วยอัตราเร็วคงที่', () => {
    const v = aimCannonball(0, 1, 0, 20, 0);
    expect(v.vx).toBeCloseTo(CANNONBALL_SPEED, 3);
    expect(v.vz).toBeCloseTo(0, 3);
    expect(v.vy).toBeGreaterThan(0); // โค้งขึ้นชดเชยแรงโน้มถ่วง
  });

  it('กระสุนบินโค้งไปตกใกล้เป้า (ภายในรัศมีชน)', () => {
    const ball = makeBall({ x: 0, y: 0.9, z: 0 }, { x: 18, z: 6 });
    let lastX = ball.x;
    let lastZ = ball.z;
    // จำลองที่ 60fps จนตกน้ำ
    for (let i = 0; i < 600 && stepCannonball(ball, 1 / 60); i++) {
      lastX = ball.x;
      lastZ = ball.z;
    }
    expect(Math.hypot(lastX - 18, lastZ - 6)).toBeLessThan(3.4); // hitRadius ของเรือโจรสลัด
  });

  it('กระสุนตกน้ำแล้วหยุดบิน (stepCannonball คืน false)', () => {
    const ball = makeBall({ x: 0, y: 0.9, z: 0 }, { x: 10, z: 0 });
    let alive = true;
    for (let i = 0; i < 1200 && alive; i++) alive = stepCannonball(ball, 1 / 60);
    expect(alive).toBe(false);
    expect(ball.y).toBeLessThanOrEqual(WATER_LEVEL + 0.05);
  });
});

describe('NavalData — AI เรือโจรสลัด', () => {
  const defn = PIRATE_CUTTER;

  it('ผู้เล่นไม่ได้ออกเรือ → ลาดตระเวนเสมอ', () => {
    expect(decideShipState('attack', 5, false, defn)).toBe('patrol');
  });

  it('ไล่ตามระยะ: ไกล → patrol, เข้าใกล้ → chase, ระยะยิง → attack', () => {
    expect(decideShipState('patrol', defn.aggroRange + 20, true, defn)).toBe('patrol');
    expect(decideShipState('patrol', defn.aggroRange - 5, true, defn)).toBe('chase');
    expect(decideShipState('chase', defn.fireRange - 2, true, defn)).toBe('attack');
  });

  it('hysteresis: หลุดระยะ aggro เล็กน้อยยังไล่ต่อ เกิน ×1.4 ค่อยเลิก', () => {
    expect(decideShipState('chase', defn.aggroRange * 1.2, true, defn)).toBe('chase');
    expect(decideShipState('chase', defn.aggroRange * 1.5, true, defn)).toBe('patrol');
  });

  it('ลดระยะมองเห็นของทุกระดับ แต่ยังมากกว่าระยะยิง', () => {
    expect(PIRATE_SHIP_TIERS.map((ship) => ship.aggroRange)).toEqual([34, 40, 52, 62]);
    for (const ship of PIRATE_SHIP_TIERS) {
      expect(ship.aggroRange).toBeGreaterThan(ship.fireRange);
    }
  });

  it('steerToward เลี้ยวจำกัดอัตราและถูกทิศ (รวม wrap ข้าม ±π)', () => {
    // เลี้ยวทีละไม่เกิน turnSpeed·dt
    const turned = steerToward(0, Math.PI / 2, 1, 0.1);
    expect(turned).toBeCloseTo(0.1, 4);
    // ข้ามรอยต่อ -π/π ต้องเลือกทางสั้น
    const wrapped = steerToward(Math.PI * 0.95, -Math.PI * 0.95, 1, 0.1);
    expect(wrapped).toBeGreaterThan(Math.PI * 0.95); // หมุนต่อไปทาง +
  });
});

describe('NavalData — ปืนใหญ่สองจังหวะ', () => {
  it('กดครั้งแรกเปิดกราบ และกดกราบเดิมครั้งที่สองจึงยิง', () => {
    const armed = resolveBroadsideCommand(0, 1, 0);
    expect(armed).toEqual({ armedSide: 1, fire: false });
    expect(resolveBroadsideCommand(armed.armedSide, 1, 0)).toEqual({
      armedSide: 1,
      fire: true,
    });
  });

  it('สลับกราบต้องเปิดกราบใหม่ก่อน และไม่ยิงระหว่างคูลดาวน์', () => {
    expect(resolveBroadsideCommand(1, -1, 0)).toEqual({
      armedSide: -1,
      fire: false,
    });
    expect(resolveBroadsideCommand(-1, -1, 0.1)).toEqual({
      armedSide: -1,
      fire: false,
    });
  });
});

describe('NavalData — เรือศัตรูหลายระดับ', () => {
  it('มีระดับง่ายไปยากและไม่เปลี่ยนค่าความถึกของ cutter เดิม', () => {
    expect(PIRATE_SHIP_TIERS.map((ship) => ship.tier)).toEqual(['skiff', 'cutter', 'brig', 'galleon']);
    expect(PIRATE_SKIFF.maxHp).toBeLessThan(PIRATE_CUTTER.maxHp);
    expect(PIRATE_CUTTER.maxHp).toBeLessThan(PIRATE_BRIG.maxHp);
    expect(PIRATE_BRIG.maxHp).toBeLessThan(PIRATE_GALLEON.maxHp);
    expect(PIRATE_CUTTER.maxHp).toBe(220);
  });

  it('กระจายจุดเกิดหลายระดับในทะเลเปิด', () => {
    expect(PIRATE_SPAWNS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(PIRATE_SPAWNS.map((spawn) => spawn.tier))).toEqual(
      new Set(['skiff', 'cutter', 'brig', 'galleon']),
    );
  });
});
