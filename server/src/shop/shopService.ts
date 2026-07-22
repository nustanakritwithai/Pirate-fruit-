import { createHash, randomInt, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Pool } from 'pg';
import {
  SHOP_DRAW_COST,
  SHOP_GACHA_CATALOG,
  SHOP_POTIONS,
  SHOP_PROTOCOL_SCHEMA_VERSION,
  SHOP_RARITY_WEIGHT,
  type ShopCatalogEntry,
  type ShopPurchaseResponse,
} from '@pirate-fruit/shared';

const requestSchema = z.object({
  schemaVersion: z.literal(SHOP_PROTOCOL_SCHEMA_VERSION),
  idempotencyKey: z.string().min(8).max(128),
  action: z.enum(['draw', 'potion']),
  potionId: z.enum(['potion-hp', 'potion-mp']).optional(),
}).superRefine((value, context) => {
  if (value.action === 'potion' && !value.potionId) {
    context.addIssue({ code: 'custom', message: 'potionId is required for potion purchases' });
  }
});

type ShopRequest = z.infer<typeof requestSchema>;

export class ShopRejectedError extends Error {
  constructor(readonly code: 'INSUFFICIENT_COINS' | 'IDEMPOTENCY_KEY_REUSED') {
    super(code === 'INSUFFICIENT_COINS' ? 'Not enough coins' : 'Idempotency key was reused');
    this.name = 'ShopRejectedError';
  }
}

function requestHash(request: ShopRequest): string {
  return createHash('sha256')
    .update(`${request.action}|${request.potionId ?? ''}`, 'utf8')
    .digest('hex');
}

function drawCatalog(roll: (max: number) => number): ShopCatalogEntry {
  const total = SHOP_GACHA_CATALOG.reduce(
    (sum, item) => sum + SHOP_RARITY_WEIGHT[item.rarity],
    0,
  );
  let remaining = roll(total);
  for (const item of SHOP_GACHA_CATALOG) {
    remaining -= SHOP_RARITY_WEIGHT[item.rarity];
    if (remaining < 0) return item;
  }
  return SHOP_GACHA_CATALOG[SHOP_GACHA_CATALOG.length - 1]!;
}

function inventoryKind(item: ShopCatalogEntry): string {
  return item.kind === 'fighting-style' ? 'style' : item.kind;
}

function safeCoins(value: string): number {
  const coins = Number(value);
  if (!Number.isSafeInteger(coins) || coins < 0) throw new Error('Invalid canonical coin balance');
  return coins;
}

export class ShopService {
  constructor(
    private readonly pool: Pool,
    private readonly roll: (max: number) => number = randomInt,
  ) {}

  async purchase(characterId: string, body: unknown): Promise<ShopPurchaseResponse> {
    const request = requestSchema.parse(body);
    const hash = requestHash(request);
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

      const drawn = request.action === 'draw' ? drawCatalog(this.roll) : null;
      const potionId = request.action === 'potion' ? request.potionId! : null;
      const cost = drawn ? SHOP_DRAW_COST : SHOP_POTIONS[potionId!].price;
      const coins = safeCoins(character.rows[0].coins);
      if (coins < cost) throw new ShopRejectedError('INSUFFICIENT_COINS');

      const itemId = drawn?.id ?? potionId!;
      const current = await client.query<{ quantity: number }>(
        'select quantity from player_inventory where character_id = $1 and item_id = $2',
        [characterId, itemId],
      );
      const oldQuantity = current.rows[0]?.quantity ?? 0;
      const quantity = drawn ? Math.max(1, oldQuantity) : oldQuantity + 1;
      const metadata = drawn
        ? { kind: inventoryKind(drawn) }
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
