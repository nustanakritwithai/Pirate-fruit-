import { describe, expect, it, vi } from 'vitest';
import type { GameStorage } from '../../persistence/GameStorage';
import { flushAndSendSummon } from '../BoatAuthorityFlow';

function storage(flush?: () => Promise<void>): GameStorage {
  return {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
    flush,
  };
}

describe('authoritative boat purchase/select → summon flow', () => {
  it('flushes the newly selected boat before sending the first summon intent', async () => {
    const order: string[] = [];
    const flush = vi.fn(async () => { order.push('save'); });
    const send = vi.fn(() => {
      order.push('summon');
      return 'intent-first-summon';
    });

    await expect(flushAndSendSummon(storage(flush), {
      connected: () => true,
      send,
    })).resolves.toBe('intent-first-summon');

    expect(order).toEqual(['save', 'summon']);
    expect(flush).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith('summon');
  });

  it('does not send a summon if the connection drops while the save is flushing', async () => {
    let connected = true;
    const send = vi.fn(() => 'should-not-send');

    const result = await flushAndSendSummon(storage(async () => {
      connected = false;
    }), {
      connected: () => connected,
      send,
    });

    expect(result).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
});
