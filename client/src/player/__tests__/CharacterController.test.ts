import { describe, expect, it, vi } from 'vitest';
import type { Input } from '../../engine/Input';
import { CollisionSystem } from '../../world/Collision';
import { CharacterController } from '../CharacterController';

function waterInput(): Input {
  return {
    moveVector: () => ({ x: 0, z: 0 }),
    sprint: false,
    jump: false,
    consumeDash: () => false,
    consumeJump: () => false,
  } as unknown as Input;
}

describe('CharacterController — ภัยน้ำทะเล', () => {
  it('คนทั่วไปว่ายได้แต่ Energy ลดเมื่ออยู่ในน้ำ', () => {
    const controller = new CharacterController(
      waterInput(),
      new CollisionSystem(() => -0.9),
      () => 0,
    );
    controller.teleport(0, -0.35, 0);
    controller.update(1);

    expect(controller.moveState.swimming).toBe(true);
    expect(controller.energy).toBeLessThan(controller.energyMax);
    expect(controller.hp).toBe(controller.hpMax);
  });

  it('เมื่อ Energy หมด HP จะลดต่อและเรียกเกิดใหม่หลังตาย', () => {
    const controller = new CharacterController(
      waterInput(),
      new CollisionSystem(() => -0.9),
      () => 0,
    );
    const onDrown = vi.fn();
    controller.onDrown = onDrown;
    controller.energy = 1;
    controller.hp = 1;
    controller.teleport(0, -0.35, 0);
    controller.update(1);

    expect(controller.energy).toBe(0);
    expect(controller.hp).toBe(0);
    expect(onDrown).toHaveBeenCalledTimes(1);
  });

  it('ผู้กินผลปีศาจจะไม่เข้าสถานะว่ายและจมลงแทน', () => {
    const controller = new CharacterController(
      waterInput(),
      new CollisionSystem(() => -0.9),
      () => 0,
    );
    controller.setDevilFruitUser(true);
    controller.teleport(0, -0.35, 0);
    controller.update(0.25);

    expect(controller.isDevilFruitUser).toBe(true);
    expect(controller.moveState.swimming).toBe(false);
    expect(controller.energy).toBeLessThan(controller.energyMax);
  });

  it('เปลี่ยนจาก dash เป็นว่ายทันทีเมื่อแตะผิวน้ำ', () => {
    const controller = new CharacterController(
      waterInput(),
      new CollisionSystem(() => -0.9),
      () => 0,
    );
    controller.teleport(0, -0.35, 0);
    controller.startDash(1, 0, 12, 0.3);
    controller.update(0.016);

    expect(controller.moveState.swimming).toBe(true);
    expect(controller.moveState.dashing).toBe(false);
  });
});

describe('CharacterController — double jump', () => {
  it('กระโดดครั้งที่สองกลางอากาศได้ แต่ครั้งที่สามไม่ได้', () => {
    let queuedJumps = 0;
    const input = {
      ...waterInput(),
      consumeJump: () => {
        if (queuedJumps <= 0) return false;
        queuedJumps -= 1;
        return true;
      },
    } as unknown as Input;
    const controller = new CharacterController(
      input,
      new CollisionSystem(() => 0),
      () => 0,
    );

    controller.teleport(0, 0, 0);
    controller.update(0.016); // sync สถานะให้ยืนบนพื้นก่อน

    queuedJumps = 1;
    controller.update(0.016); // กระโดดครั้งที่หนึ่ง
    controller.update(0.1);   // ลอยอยู่กลางอากาศ
    queuedJumps = 1;
    controller.update(0.016); // กระโดดครั้งที่สอง
    const secondJumpSpeed = controller.verticalSpeed;

    queuedJumps = 1;
    controller.update(0.016); // ครั้งที่สามควรถูกปฏิเสธ
    expect(controller.verticalSpeed).toBeLessThan(secondJumpSpeed);
    expect(controller.verticalSpeed).toBeGreaterThan(0);
  });

  it('moves away from an authoritative hit while the hit-stun lock is active', () => {
    const controller = new CharacterController(
      waterInput(),
      new CollisionSystem(() => 0),
      () => 0,
    );
    controller.teleport(0, 0, 0);
    controller.update(0.016);
    controller.applyStun(0.34);
    controller.applyKnockback(1, 0, 10, 0.34);
    controller.update(0.1);
    expect(controller.position.x).toBeCloseTo(1, 2);
    expect(controller.position.z).toBeCloseTo(0, 2);
    expect(controller.isStunned).toBe(true);
  });
});
