import { describe, expect, it } from 'vitest';
import { defaultPlayerState } from '../player/playerState.js';
import { applyCanonicalTradeOperation } from './centralTradeAdapter.js';

describe('canonical trade adapter', () => {
  it('buys cargo using trusted quote and canonical coins', () => {
    const state = defaultPlayerState();
    state.progression.coins = 100;
    const result = applyCanonicalTradeOperation(state, {
      schemaVersion: 1, idempotencyKey: 'trade-state-0001', action: 'buy',
      islandId: 'starter-island', commodityId: 'fresh-fish', quantity: 2,
    }, { islandId: 'starter-island', commodityId: 'fresh-fish', unitPrice: 10, tradableStock: 10 }, () => true);
    expect(result.state.progression.coins).toBe(80);
    expect(result.state.cargo.slots).toEqual([{ commodityId: 'fresh-fish', quantity: 2 }]);
  });

  it('sells only held cargo and replays after JSON IPC without double mutation', () => {
    const state = defaultPlayerState();
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
