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
});
