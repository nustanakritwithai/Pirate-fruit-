import { describe, expect, it, vi } from 'vitest';
import { applyPirateVitalsSnapshot } from '../PirateVitalsClientBridge';
import { PirateVitalsAuthority, PIRATE_VITALS_CONTRACT } from '../PirateVitalsAuthority';

describe('Pirate vitals client bridge', () => {
  it('latches all local writers after the first valid server snapshot', () => {
    const authority = new PirateVitalsAuthority();
    const controller = {
      setServerVitalsAuthority: vi.fn(), teleport: vi.fn(), heading: 0,
    } as any;
    const combat = { setServerVitalsAuthority: vi.fn(), applyServerVitals: vi.fn() } as any;
    const spawn = { setServerVitalsAuthority: vi.fn(), activateSpawnPoint: vi.fn() } as any;
    const accepted = applyPirateVitalsSnapshot(authority, controller, combat, spawn, {
      contract: PIRATE_VITALS_CONTRACT, revision: 1, serverTimeMs: 10, hp: 40, maxHp: 100,
      guard: 60, guardMax: 100, guardBroken: false, hitstunUntil: 0,
      energy: 20, maxEnergy: 100, mp: 10, maxMp: 100, dead: false,
    });
    expect(accepted).toBe(true);
    expect(controller.setServerVitalsAuthority).toHaveBeenCalledWith(true);
    expect(combat.applyServerVitals).toHaveBeenCalledWith(expect.objectContaining({ hp: 40 }));
  });
});
