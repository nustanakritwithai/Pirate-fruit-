import { describe, expect, it, vi } from 'vitest';
import { PirateVitalsEmitter } from '../PirateVitalsEmitter';

describe('Pirate vitals emitter', () => {
  it('coalesces duplicate input while one request is in flight', async () => {
    let resolve: ((value: any) => void) | undefined;
    const executor = { request: vi.fn(() => new Promise((r) => { resolve = r; })) } as any;
    const emitter = new PirateVitalsEmitter(executor);
    const first = emitter.sendInput({ blocking: false, mounted: false, sprinting: false });
    expect(await emitter.sendInput({ blocking: false, mounted: false, sprinting: false })).toBe(false);
    resolve!({ outcome: { accepted: true } });
    expect(await first).toBe(true);
    expect(executor.request).toHaveBeenCalledTimes(1);
  });

  it('emits server-owned buff and respawn operations with their idempotency keys', async () => {
    const executor = { request: vi.fn(async () => ({ revision: 1, persisted: {}, outcome: { ok: true } })) } as any;
    const emitter = new PirateVitalsEmitter(executor);
    expect(await emitter.buff('fruit-buff-1')).toBe(true);
    expect(await emitter.respawn()).toBe(true);
    expect(executor.request).toHaveBeenNthCalledWith(1, expect.objectContaining({ type: 'vitalsBuff', skillId: 'fruit-buff-1', idempotencyKey: expect.any(String) }));
    expect(executor.request).toHaveBeenNthCalledWith(2, expect.objectContaining({ type: 'vitalsRespawn', idempotencyKey: expect.any(String) }));
  });

  it('emits a canonical skill operation and accepts the server acknowledgement', async () => {
    const executor = { request: vi.fn(async () => ({ revision: 2, persisted: {}, outcome: { accepted: true } })) } as any;
    const emitter = new PirateVitalsEmitter(executor);
    expect(await emitter.skill('fruit-buff-1')).toBe(true);
    expect(executor.request).toHaveBeenCalledWith(expect.objectContaining({ type: 'vitalsSkill', skillId: 'fruit-buff-1', idempotencyKey: expect.any(String) }));
  });
});
