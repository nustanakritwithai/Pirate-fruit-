import { describe, expect, it, vi } from 'vitest';
import { defaultPlayerState } from '../player/playerState.js';
import { applyCanonicalBoatOperation } from '../player/centralBoatAdapter.js';
import { applyCentralOriginalTradeOperation, quoteCentralOriginalTradeOperation } from './centralOriginalTradeOperation.js';

const market = { revision: 4, tick: 8, documentVersion: 1, document: {} };

vi.mock('../economy/economyEngine.js', () => ({
  loadBundledEconomyEngine: vi.fn(async () => {
    let tick = 8;
    return {
      get tick() { return tick; },
      advance: () => { tick += 1; },
      advanceCooperatively: async () => { tick += 1; },
      snapshot: () => ({ tick, documentVersion: 1, document: {} }),
      quoteBuy: () => ({ unitPrice: 10, tradableStock: 20 }),
      quoteSell: () => ({ unitPrice: 7, feeRate: 0.05 }),
      applyBuy: vi.fn(), applySell: vi.fn(), cargoFits: () => true,
    };
  }),
}));

describe('original central trade operation', () => {
  it('quotes and executes the actual worker payload, then replays without mutating twice', async () => {
    const quote = await quoteCentralOriginalTradeOperation({
      schemaVersion: 1, type: 'tradeQuote', action: 'buy', islandId: 'starter-island', commodityId: 'fresh-fish', quantity: 2,
    }, market);
    expect(quote).toMatchObject({ marketRevision: 4, quote: { unitPrice: 10, tradableStock: 20 } });

    const state = applyCanonicalBoatOperation(
      defaultPlayerState(),
      { type: 'boatPurchase', boatId: 'training-dinghy' },
    ).state;
    state.progression.coins = 100;
    const input = { schemaVersion: 1, type: 'trade', idempotencyKey: 'trade:test-0001', action: 'buy', islandId: 'starter-island', commodityId: 'fresh-fish', quantity: 2 };
    const first = await applyCentralOriginalTradeOperation(state, input, market, 'pirate-trade-command-1');
    expect(first.outcome.total).toBe(20);
    expect(first.nextMarket.revision).toBe(5);
    const replay = await applyCentralOriginalTradeOperation(first.state, input, first.nextMarket, 'pirate-trade-command-1');
    expect(replay.outcome.idempotentReplay).toBe(true);
    expect(replay.state.progression.coins).toBe(first.state.progression.coins);
    expect(replay.nextMarket.revision).toBe(5);
  });
});
