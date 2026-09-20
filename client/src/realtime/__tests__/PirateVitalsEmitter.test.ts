import { describe, expect, it, vi } from 'vitest';
import { PirateVitalsEmitter } from '../PirateVitalsEmitter';

describe('Pirate vitals emitter', () => {
  it('coalesces duplicate input while one request is in flight', async () => {
    let resolve: ((value: any) => void) | undefined;
    const executor = { request: vi.fn(() => new Promise((r) => { resolve = r; })) } as any;
    const emitter = new PirateVitalsEmitter(executor);
    const first = emitter.sendInput({ blocking: false, mounted: false, sprinting: false });
    expect(await emitter.sendInput({ blocking: false, mounted: false, sprinting: false })).toBe(false);
    resolve!({ outcome: { ok: true } });
    expect(await first).toBe(true);
    expect(executor.request).toHaveBeenCalledTimes(1);
  });
});
