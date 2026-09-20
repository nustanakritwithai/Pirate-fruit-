import { describe, expect, it, vi } from 'vitest';
import { SHOP_PROTOCOL_SCHEMA_VERSION } from '@pirate-fruit/shared';
import { applyCanonicalShopOperation, getCanonicalShopReceipt, purchaseCanonicalShop } from './centralShopAdapter.js';
import { defaultPlayerState } from '../player/playerState.js';

describe('canonical shop adapter', () => {
  it('passes only the existing protocol request to ShopService', async () => {
    const purchase = vi.fn(async (_characterId: string, request: unknown) => ({
      ok: true as const,
      schemaVersion: SHOP_PROTOCOL_SCHEMA_VERSION,
      action: 'potion' as const,
      coins: 10,
      item: { kind: 'consumable' as const, id: 'potion-hp' as const, rarity: 'common' as const },
      quantity: 1,
      isNew: true,
      idempotentReplay: false,
    }));
    const result = await purchaseCanonicalShop({ purchase }, 'character-1', {
      idempotencyKey: 'shop-adapter-0001', action: 'potion', potionId: 'potion-hp',
      coins: 999999, item: 'forged', quantity: 99,
    });
    expect(result.coins).toBe(10);
    expect(purchase).toHaveBeenCalledWith('character-1', {
      schemaVersion: SHOP_PROTOCOL_SCHEMA_VERSION,
      idempotencyKey: 'shop-adapter-0001', action: 'potion', potionId: 'potion-hp',
    });
  });

  it('rejects malformed shop operations before authority is called', async () => {
    const purchase = vi.fn();
    await expect(purchaseCanonicalShop({ purchase }, 'character-1', {
      idempotencyKey: 'shop-adapter-0002', action: 'potion',
    })).rejects.toThrow('potionId is required');
    expect(purchase).not.toHaveBeenCalled();
  });

  it('applies potion purchase to canonical state and records non-serialized receipt', () => {
    const state = defaultPlayerState();
    state.progression.coins = 100;
    const first = applyCanonicalShopOperation(state, {
      idempotencyKey: 'shop-state-0001', action: 'potion', potionId: 'potion-hp',
    });
    expect(first.state.progression.coins).toBe(60);
    expect(first.state.inventory.consumables['potion-hp']).toBe(1);
    expect(first.persisted.player.progression).toContain('"coins":60');
    expect(getCanonicalShopReceipt(first.state)?.hash).toBeDefined();
    const replay = applyCanonicalShopOperation(first.state, {
      idempotencyKey: 'shop-state-0001', action: 'potion', potionId: 'potion-hp',
    });
    expect(replay.outcome.idempotentReplay).toBe(true);
    expect(replay.state.progression.coins).toBe(60);
    expect(() => applyCanonicalShopOperation(first.state, {
      idempotencyKey: 'shop-state-0001', action: 'potion', potionId: 'potion-mp',
    })).toThrow('IDEMPOTENCY_KEY_REUSED');
  });

  it('rejects purchases without enough canonical coins', () => {
    const state = defaultPlayerState();
    expect(() => applyCanonicalShopOperation(state, {
      idempotencyKey: 'shop-state-0002', action: 'potion', potionId: 'potion-hp',
    })).toThrow('INSUFFICIENT_COINS');
  });
});
