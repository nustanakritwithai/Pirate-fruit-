import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { Effects } from '../../effects/Effects';
import { PlayerCombat } from '../PlayerCombat';
import { SkillLoadout } from '../SkillLoadout';
import { ScopedVisualEffects } from '../../realtime/ScopedVisualEffects';

function createCombat(requestServerSkill: (skillId: string) => Promise<boolean>) {
  const scene = new THREE.Scene();
  const controller = {
    position: new THREE.Vector3(), heading: 0, hp: 100, hpMax: 100, mp: 100, mpMax: 100,
    isMounted: false, inputEnabled: true, verticalSpeed: 0,
    setMovementLock: vi.fn(), applyStun: vi.fn(), applyKnockback: vi.fn(),
  };
  const effects = new ScopedVisualEffects(new Effects(scene));
  const combat = new PlayerCombat(
    scene,
    {} as never,
    controller as never,
    {} as never,
    effects,
    null,
    new SkillLoadout(),
    undefined,
    undefined,
    undefined,
    undefined,
    requestServerSkill,
  );
  combat.setServerVitalsAuthority(true);
  return { combat, controller };
}

describe('server-authoritative skill cast', () => {
  it('does not spend MP or create a cast before a rejected ACK', async () => {
    const request = vi.fn(async () => false);
    const { combat, controller } = createCombat(request);
    (combat as any).beginCastSkill(0);
    expect(request).toHaveBeenCalledTimes(1);
    expect(controller.mp).toBe(100);
    expect((combat as any).pendingCast).toBeNull();
    await Promise.resolve();
    expect((combat as any).pendingCast).toBeNull();
  });

  it('starts one pending cast only after an accepted ACK', async () => {
    const request = vi.fn(async () => true);
    const { combat, controller } = createCombat(request);
    (combat as any).beginCastSkill(0);
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(1);
    expect(controller.mp).toBe(100);
    expect((combat as any).pendingCast).not.toBeNull();
  });
});
