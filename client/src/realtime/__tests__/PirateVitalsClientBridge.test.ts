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

  it('applies one respawn teleport for a persisted respawn revision', () => {
    const authority = new PirateVitalsAuthority();
    const controller = { setServerVitalsAuthority: vi.fn(), teleport: vi.fn(), heading: 0, applyProgressionCaps: vi.fn() } as any;
    const combat = { setServerVitalsAuthority: vi.fn(), applyServerVitals: vi.fn() } as any;
    const spawn = { setServerVitalsAuthority: vi.fn(), activateSpawnPoint: vi.fn() } as any;
    const snapshot = {
      contract: PIRATE_VITALS_CONTRACT, revision: 2, serverTimeMs: 10, hp: 100, maxHp: 100,
      guard: 100, guardMax: 100, guardBroken: false, hitstunUntil: 0,
      energy: 100, maxEnergy: 100, mp: 100, maxMp: 100, dead: false,
      respawn: { spawnId: 'starter-spawn', islandId: 'starter-island', x: 1, y: 2, z: 3, heading: 0.5, atRevision: 2 },
    };
    expect(applyPirateVitalsSnapshot(authority, controller, combat, spawn, snapshot)).toBe(true);
    expect(applyPirateVitalsSnapshot(authority, controller, combat, spawn, { ...snapshot, revision: 3, serverTimeMs: 20 })).toBe(true);
    expect(controller.teleport).toHaveBeenCalledTimes(1);
    expect(spawn.activateSpawnPoint).toHaveBeenCalledTimes(1);
  });

  it('requests server respawn once when a dead snapshot arrives, including at boot', async () => {
    const authority = new PirateVitalsAuthority();
    const controller = { setServerVitalsAuthority: vi.fn(), teleport: vi.fn(), heading: 0 } as any;
    const combat = { setServerVitalsAuthority: vi.fn(), applyServerVitals: vi.fn() } as any;
    const spawn = { setServerVitalsAuthority: vi.fn(), activateSpawnPoint: vi.fn() } as any;
    const requestRespawn = vi.fn(async () => true);
    const onServerDefeat = vi.fn();
    const dead = {
      contract: PIRATE_VITALS_CONTRACT, revision: 5, serverTimeMs: 100, hp: 0, maxHp: 100,
      guard: 0, guardMax: 100, guardBroken: true, hitstunUntil: 100,
      energy: 0, maxEnergy: 100, mp: 0, maxMp: 100, dead: true,
    };
    expect(applyPirateVitalsSnapshot(authority, controller, combat, spawn, dead, { onServerDefeat, requestRespawn })).toBe(true);
    await Promise.resolve();
    expect(applyPirateVitalsSnapshot(authority, controller, combat, spawn, { ...dead, revision: 6 }, { onServerDefeat, requestRespawn })).toBe(true);
    expect(onServerDefeat).toHaveBeenCalledTimes(1);
    expect(requestRespawn).toHaveBeenCalledTimes(1);
  });

  it('retries a failed respawn request from the repeated dead snapshot after the backoff', async () => {
    const authority = new PirateVitalsAuthority();
    const controller = { setServerVitalsAuthority: vi.fn(), teleport: vi.fn(), heading: 0 } as any;
    const combat = { setServerVitalsAuthority: vi.fn(), applyServerVitals: vi.fn() } as any;
    const spawn = { setServerVitalsAuthority: vi.fn(), activateSpawnPoint: vi.fn() } as any;
    const requestRespawn = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const dead = {
      contract: PIRATE_VITALS_CONTRACT, revision: 8, serverTimeMs: 100, hp: 0, maxHp: 100,
      guard: 0, guardMax: 100, guardBroken: true, hitstunUntil: 100,
      energy: 0, maxEnergy: 100, mp: 0, maxMp: 100, dead: true,
    };
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    applyPirateVitalsSnapshot(authority, controller, combat, spawn, dead, { requestRespawn });
    await Promise.resolve();
    clock.mockReturnValue(3_001);
    applyPirateVitalsSnapshot(authority, controller, combat, spawn, dead, { requestRespawn });
    await Promise.resolve();
    expect(requestRespawn).toHaveBeenCalledTimes(2);
    clock.mockRestore();
  });

  it('reports server damage and guard break without mutating HP locally', () => {
    const authority = new PirateVitalsAuthority();
    const controller = { setServerVitalsAuthority: vi.fn(), teleport: vi.fn(), heading: 0 } as any;
    const combat = { setServerVitalsAuthority: vi.fn(), applyServerVitals: vi.fn() } as any;
    const spawn = { setServerVitalsAuthority: vi.fn(), activateSpawnPoint: vi.fn() } as any;
    const onServerDamage = vi.fn();
    const onServerGuardBreak = vi.fn();
    const base = {
      contract: PIRATE_VITALS_CONTRACT, revision: 20, serverTimeMs: 100, hp: 100, maxHp: 100,
      guard: 100, guardMax: 100, guardBroken: false, hitstunUntil: 0,
      energy: 100, maxEnergy: 100, mp: 100, maxMp: 100, dead: false,
    };
    applyPirateVitalsSnapshot(authority, controller, combat, spawn, base, { onServerDamage, onServerGuardBreak });
    applyPirateVitalsSnapshot(authority, controller, combat, spawn, { ...base, revision: 21, hp: 70, guard: 0, guardBroken: true }, { onServerDamage, onServerGuardBreak });
    expect(onServerDamage).toHaveBeenCalledWith(30);
    expect(onServerGuardBreak).toHaveBeenCalledTimes(1);
  });
});
