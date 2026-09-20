import { randomInt, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import {
  SHOP_PROTOCOL_SCHEMA_VERSION,
  type ShopPurchaseResponse,
} from '@pirate-fruit/shared';
import {
  drawShopCatalog, safeCanonicalCoins, shopCost, shopInventoryKind,
  shopNextQuantity, shopRequestHash, parseShopRequest,
} from './shopRules.js';

export class ShopRejectedError extends Error {
  constructor(readonly code: 'INSUFFICIENT_COINS' | 'IDEMPOTENCY_KEY_REUSED') {
    super(code === 'INSUFFICIENT_COINS' ? 'Not enough coins' : 'Idempotency key was reused');
    this.name = 'ShopRejectedError';
  }
}

export class ShopService {
  constructor(
    private readonly pool: Pool,
    private readonly roll: (max: number) => number = randomInt,
  ) {}

  async purchase(characterId: string, body: unknown): Promise<ShopPurchaseResponse> {
    const request = parseShopRequest(body);
    const hash = shopRequestHash(request);
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const character = await client.query<{ coins: string }>(
        'select coins::text as coins from characters where id = $1 for update',
        [characterId],
      );
      if (!character.rows[0]) throw new Error('Character identity was not found');

      const prior = await client.query<{ request_hash: string; result_json: ShopPurchaseResponse }>(
        `select request_hash, result_json from shop_transactions
          where character_id = $1 and idempotency_key = $2`,
        [characterId, request.idempotencyKey],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].request_hash !== hash) throw new ShopRejectedError('IDEMPOTENCY_KEY_REUSED');
        await client.query('commit');
        return { ...prior.rows[0].result_json, idempotentReplay: true };
      }

      const drawn = request.action === 'draw' ? drawShopCatalog(this.roll) : null;
      const potionId = request.action === 'potion' ? request.potionId! : null;
      const cost = shopCost(request, drawn);
      const coins = safeCanonicalCoins(character.rows[0].coins);
      if (coins < cost) throw new ShopRejectedError('INSUFFICIENT_COINS');

      const itemId = drawn?.id ?? potionId!;
      const current = await client.query<{ quantity: number }>(
        'select quantity from player_inventory where character_id = $1 and item_id = $2',
        [characterId, itemId],
      );
      const oldQuantity = current.rows[0]?.quantity ?? 0;
      const quantity = shopNextQuantity(drawn, oldQuantity);
      const metadata = drawn
        ? { kind: shopInventoryKind(drawn) }
        : { kind: 'consumable' };
      await client.query(
        `insert into player_inventory
          (character_id, item_id, quantity, metadata_json, updated_at)
         values ($1,$2,$3,$4::jsonb,now())
         on conflict (character_id, item_id) do update set
           quantity = excluded.quantity,
           metadata_json = excluded.metadata_json,
           updated_at = now()`,
        [characterId, itemId, quantity, JSON.stringify(metadata)],
      );
      const nextCoins = coins - cost;
      await client.query(
        'update characters set coins = $2, updated_at = now() where id = $1',
        [characterId, String(nextCoins)],
      );

      const response: ShopPurchaseResponse = {
        ok: true,
        schemaVersion: SHOP_PROTOCOL_SCHEMA_VERSION,
        action: request.action,
        coins: nextCoins,
        item: drawn ?? { kind: 'consumable', id: potionId!, rarity: 'common' },
        quantity,
        isNew: oldQuantity === 0,
        idempotentReplay: false,
      };
      await client.query(
        `insert into shop_transactions
          (id, character_id, action, item_id, quantity, cost,
           idempotency_key, request_hash, result_json)
         values ($1,$2,$3,$4,1,$5,$6,$7,$8::jsonb)`,
        [
          randomUUID(),
          characterId,
          request.action,
          itemId,
          String(cost),
          request.idempotencyKey,
          hash,
          JSON.stringify(response),
        ],
      );
      await client.query('commit');
      return response;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
