import { describe, expect, it, vi } from 'vitest';
import { SHOP_PROTOCOL_SCHEMA_VERSION } from '@pirate-fruit/shared';
import { purchaseCanonicalShop } from './centralShopAdapter.js';

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
});
