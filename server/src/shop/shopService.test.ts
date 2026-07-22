import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import {
  AUTHORITATIVE_SHOP_MIGRATION_TAG,
  CORE_MIGRATION_TAG,
  databaseMigrationDirectory,
} from '../persistence/migrations.js';
import { ShopRejectedError, ShopService } from './shopService.js';

const USER = '22222222-2222-4222-8222-222222222222';
const CHARACTER = '11111111-1111-4111-8111-111111111111';
const pools: Pool[] = [];

afterEach(async () => Promise.all(pools.splice(0).map((pool) => pool.end())));

async function seededPool(coins = 500): Promise<Pool> {
  const memory = newDb();
  const adapter = memory.adapters.createPg();
  const pool = new adapter.Pool() as unknown as Pool;
  pools.push(pool);
  const directory = databaseMigrationDirectory();
  for (const tag of [CORE_MIGRATION_TAG, AUTHORITATIVE_SHOP_MIGRATION_TAG]) {
    const sql = await readFile(join(directory, `${tag}.sql`), 'utf8');
    for (const statement of sql.split('--> statement-breakpoint').map((part) => part.trim()).filter(Boolean)) {
      await pool.query(statement);
    }
  }
  await pool.query('insert into users (id) values ($1)', [USER]);
  await pool.query(
    `insert into characters (id, user_id, name, coins, current_island_id, spawn_id)
     values ($1,$2,'Shopper',$3,'starter-island','village')`,
    [CHARACTER, USER, String(coins)],
  );
  return pool;
}

function drawRequest(key = 'shop:draw-0001') {
  return { schemaVersion: 1, idempotencyKey: key, action: 'draw' };
}

describe('authoritative shop', () => {
  it('chooses and stores the draw on Server while deducting canonical coins', async () => {
    const pool = await seededPool();
    const shop = new ShopService(pool, () => 0);

    const result = await shop.purchase(CHARACTER, drawRequest());

    expect(result).toMatchObject({ action: 'draw', coins: 350, isNew: true });
    const item = await pool.query<{ item_id: string; metadata_json: { kind: string } }>(
      'select item_id, metadata_json from player_inventory where character_id = $1',
      [CHARACTER],
    );
    expect(item.rows).toEqual([{ item_id: result.item.id, metadata_json: { kind: 'sword' } }]);
  });

  it('replays an idempotency key without charging or adding twice', async () => {
    const pool = await seededPool();
    const shop = new ShopService(pool, () => 0);

    const first = await shop.purchase(CHARACTER, drawRequest());
    const replay = await shop.purchase(CHARACTER, drawRequest());

    expect(replay).toEqual({ ...first, idempotentReplay: true });
    const character = await pool.query<{ coins: string }>('select coins::text as coins from characters');
    expect(Number(character.rows[0]?.coins)).toBe(350);
  });

  it('purchases potion quantities transactionally and rejects insufficient coins', async () => {
    const pool = await seededPool(80);
    const shop = new ShopService(pool);
    const request = (key: string) => ({
      schemaVersion: 1,
      idempotencyKey: key,
      action: 'potion',
      potionId: 'potion-hp',
    });

    expect(await shop.purchase(CHARACTER, request('shop:potion-1'))).toMatchObject({ quantity: 1, coins: 40 });
    expect(await shop.purchase(CHARACTER, request('shop:potion-2'))).toMatchObject({ quantity: 2, coins: 0 });
    await expect(shop.purchase(CHARACTER, request('shop:potion-3'))).rejects.toBeInstanceOf(ShopRejectedError);
  });
});
