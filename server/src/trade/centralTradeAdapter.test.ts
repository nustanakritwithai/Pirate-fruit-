import { describe, expect, it, vi } from 'vitest';
import { defaultPlayerState } from '../player/playerState.js';
import { applyCanonicalBoatOperation } from '../player/centralBoatAdapter.js';
import { applyCanonicalTradeOperation, executeCanonicalTrade } from './centralTradeAdapter.js';

describe('canonical trade adapter', () => {
  it('delegates typed central operations to the existing atomic TradeService', async () => {
    const response = {
      ok: true as const,
      schemaVersion: 1 as const,
      action: 'buy' as const,
      islandId: 'starter-island',
      commodityId: 'fresh-fish',
      quantity: 2,
      unitPrice: 10,
      total: 20,
      fee: 0,
      coins: 80,
      cargo: [{ commodityId: 'fresh-fish', quantity: 2 }],
      idempotentReplay: false,
    };
    const execute = vi.fn(async (_characterId: string, input: unknown) => {
      expect(input).toMatchObject({ action: 'buy', commodityId: 'fresh-fish', quantity: 2 });
      return response;
    });

    await expect(executeCanonicalTrade(
      { execute },
      'character-1',
      { schemaVersion: 1, idempotencyKey: 'trade-central-0001', action: 'buy',
        islandId: 'starter-island', commodityId: 'fresh-fish', quantity: 2 },
    )).resolves.toEqual(response);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith('character-1', expect.any(Object));
  });

  it('rejects a malformed central operation before reaching the authority', async () => {
    const execute = vi.fn();
    await expect(executeCanonicalTrade(
      { execute }, 'character-1', { action: 'buy', commodityId: 'fresh-fish' },
    )).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });

  it('buys cargo using trusted quote and canonical coins', () => {
    const state = applyCanonicalBoatOperation(defaultPlayerState(), { type: 'boatPurchase', boatId: 'training-dinghy' }).state;
    state.progression.coins = 100;
    const result = applyCanonicalTradeOperation(state, {
      schemaVersion: 1, idempotencyKey: 'trade-state-0001', action: 'buy',
      islandId: 'starter-island', commodityId: 'fresh-fish', quantity: 2,
    }, { islandId: 'starter-island', commodityId: 'fresh-fish', unitPrice: 10, tradableStock: 10 }, () => true);
    expect(result.state.progression.coins).toBe(80);
    expect(result.state.cargo.slots).toEqual([{ commodityId: 'fresh-fish', quantity: 2 }]);
  });

  it('sells only held cargo and replays after JSON IPC without double mutation', () => {
    const state = applyCanonicalBoatOperation(defaultPlayerState(), { type: 'boatPurchase', boatId: 'training-dinghy' }).state;
    state.progression.coins = 10;
    state.cargo.slots = [{ commodityId: 'fresh-fish', quantity: 3 }];
    const first = applyCanonicalTradeOperation(state, {
      schemaVersion: 1, idempotencyKey: 'trade-state-0002', action: 'sell',
      islandId: 'starter-island', commodityId: 'fresh-fish', quantity: 2,
    }, { islandId: 'starter-island', commodityId: 'fresh-fish', unitPrice: 8, feeRate: 0.1 }, () => true);
    expect(first.state.progression.coins).toBe(24);
    const replay = applyCanonicalTradeOperation(JSON.parse(JSON.stringify(first.state)), {
      schemaVersion: 1, idempotencyKey: 'trade-state-0002', action: 'sell',
      islandId: 'starter-island', commodityId: 'fresh-fish', quantity: 2,
    }, { islandId: 'starter-island', commodityId: 'fresh-fish', unitPrice: 8, feeRate: 0.1 }, () => true);
    expect(replay.outcome.idempotentReplay).toBe(true);
    expect(replay.state.progression.coins).toBe(24);
    expect(replay.state.cargo.slots).toEqual([{ commodityId: 'fresh-fish', quantity: 1 }]);
  });
});
