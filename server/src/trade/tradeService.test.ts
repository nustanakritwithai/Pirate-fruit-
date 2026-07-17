import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import {
  CORE_MIGRATION_TAG,
  PLAYER_SAVE_MIGRATION_TAG,
  databaseMigrationDirectory,
} from '../persistence/migrations.js';
import type { EconomyEngine } from '../economy/economyEngine.js';
import type { EconomyRuntime } from '../economy/economyRuntime.js';
import { PostgresTradeRepository, TradeRejectedError } from './tradeRepository.js';
import { TradeService } from './tradeService.js';

const CHARACTER = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const BOAT = '33333333-3333-4333-8333-333333333333';

const pools: Pool[] = [];

afterEach(async () => {
  await Promise.all(pools.splice(0).map((pool) => pool.end()));
  vi.restoreAllMocks();
});

async function applySchema(pool: Pool): Promise<void> {
  // pg-mem ไม่มี pg_advisory_lock — apply ไฟล์ migration ตรง ๆ แบบเดียวกับ migrations.test
  const directory = databaseMigrationDirectory();
  for (const tag of [CORE_MIGRATION_TAG, PLAYER_SAVE_MIGRATION_TAG]) {
    const sql = await readFile(join(directory, `${tag}.sql`), 'utf8');
    for (const statement of sql
      .split('--> statement-breakpoint')
      .map((part) => part.trim())
      .filter(Boolean)) {
      await pool.query(statement);
    }
  }
}

async function seededPool(coins = 1_000): Promise<Pool> {
  const memory = newDb();
  const adapter = memory.adapters.createPg();
  const pool = new adapter.Pool() as unknown as Pool;
  pools.push(pool);
  await applySchema(pool);
  await pool.query('insert into users (id) values ($1)', [USER]);
  await pool.query(
    `insert into characters (id, user_id, name, coins, current_island_id, spawn_id)
     values ($1, $2, 'Trader', $3, 'starter-island', 'village')`,
    [CHARACTER, USER, String(coins)],
  );
  await pool.query(
    `insert into player_boats
       (id, character_id, boat_definition_id, name, level, hp, max_hp, cargo_capacity, is_active)
     values ($1, $2, 'training-dinghy', 'เรือพายฝึกหัด', 1, 100, 100, 8, true)`,
    [BOAT, CHARACTER],
  );
  return pool;
}

interface EngineOverrides {
  unitPrice?: number;
  tradableStock?: number | null;
  feeRate?: number;
  cargoFits?: boolean;
}

function fakeEngine(overrides: EngineOverrides = {}): EconomyEngine & {
  applied: { action: string; quantity: number }[];
} {
  const applied: { action: string; quantity: number }[] = [];
  return {
    tick: 0,
    advance: () => undefined,
    snapshot: () => ({ tick: 0, documentVersion: 8, document: {} }),
    quoteBuy: () => ({
      unitPrice: overrides.unitPrice ?? 10,
      tradableStock: overrides.tradableStock === undefined ? 50 : overrides.tradableStock,
    }),
    quoteSell: () => ({
      unitPrice: overrides.unitPrice ?? 8,
      feeRate: overrides.feeRate ?? 0.1,
    }),
    applyBuy: (_i, _c, quantity) => { applied.push({ action: 'buy', quantity }); },
    applySell: (_i, _c, quantity) => { applied.push({ action: 'sell', quantity }); },
    cargoFits: () => overrides.cargoFits ?? true,
    applied,
  };
}

/** runtime ปลอมที่ serialize แบบเดียวกับของจริง (คิวเดี่ยว) — ให้เทสต์ service ตรงชั้น */
function fakeRuntime(engine: EconomyEngine): EconomyRuntime {
  let queue: Promise<unknown> = Promise.resolve();
  return {
    executeExclusive<T>(fn: (e: EconomyEngine) => Promise<T> | T): Promise<T> {
      const run = queue.then(() => fn(engine));
      queue = run.then(() => undefined, () => undefined);
      return run;
    },
  } as unknown as EconomyRuntime;
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    idempotencyKey: 'trade:test-0001',
    action: 'buy',
    islandId: 'starter-island',
    commodityId: 'fish-fresh',
    quantity: 4,
    ...overrides,
  };
}

async function coinsOf(pool: Pool): Promise<number> {
  const row = await pool.query<{ coins: string }>(
    'select coins::text as coins from characters where id = $1',
    [CHARACTER],
  );
  return Number(row.rows[0]!.coins);
}

describe('S8 trade authority', () => {
  it('buys atomically: coins down, cargo row up, audit written', async () => {
    const pool = await seededPool(1_000);
    const engine = fakeEngine({ unitPrice: 25 });
    const service = new TradeService(fakeRuntime(engine), new PostgresTradeRepository(pool));

    const result = await service.execute(CHARACTER, request());

    expect(result).toMatchObject({
      ok: true,
      unitPrice: 25,
      total: 100,
      coins: 900,
      cargo: [{ commodityId: 'fish-fresh', quantity: 4 }],
      idempotentReplay: false,
    });
    expect(await coinsOf(pool)).toBe(900);
    const audit = await pool.query('select action, quantity from trade_transactions');
    expect(audit.rows).toEqual([{ action: 'buy', quantity: 4 }]);
    expect(engine.applied).toEqual([{ action: 'buy', quantity: 4 }]);
  });

  it('rejects INSUFFICIENT_COINS without any mutation', async () => {
    const pool = await seededPool(30);
    const engine = fakeEngine({ unitPrice: 25 });
    const service = new TradeService(fakeRuntime(engine), new PostgresTradeRepository(pool));

    await expect(service.execute(CHARACTER, request())).rejects.toMatchObject({
      code: 'INSUFFICIENT_COINS',
    });
    expect(await coinsOf(pool)).toBe(30);
    expect(engine.applied).toEqual([]);
    const cargo = await pool.query('select * from player_cargo');
    expect(cargo.rows).toHaveLength(0);
  });

  it('rejects INSUFFICIENT_STOCK before touching the database', async () => {
    const pool = await seededPool();
    const engine = fakeEngine({ tradableStock: 2 });
    const service = new TradeService(fakeRuntime(engine), new PostgresTradeRepository(pool));

    await expect(service.execute(CHARACTER, request({ quantity: 5 }))).rejects.toMatchObject({
      code: 'INSUFFICIENT_STOCK',
    });
    const audit = await pool.query('select * from trade_transactions');
    expect(audit.rows).toHaveLength(0);
  });

  it('rejects CARGO_FULL from the shared capacity databook', async () => {
    const pool = await seededPool();
    const engine = fakeEngine({ cargoFits: false });
    const service = new TradeService(fakeRuntime(engine), new PostgresTradeRepository(pool));

    await expect(service.execute(CHARACTER, request())).rejects.toMatchObject({
      code: 'CARGO_FULL',
    });
    expect(await coinsOf(pool)).toBe(1_000);
  });

  it('rejects PRICE_MOVED when the confirmed price drifted beyond tolerance', async () => {
    const pool = await seededPool();
    const engine = fakeEngine({ unitPrice: 40 });
    const service = new TradeService(fakeRuntime(engine), new PostgresTradeRepository(pool));

    await expect(
      service.execute(CHARACTER, request({ expectedUnitPrice: 20 })),
    ).rejects.toMatchObject({ code: 'PRICE_MOVED' });
  });

  it('sells with fee, deletes emptied cargo rows, and rejects overselling', async () => {
    const pool = await seededPool(100);
    await pool.query(
      `insert into player_cargo (character_id, boat_id, commodity_id, quantity)
       values ($1, $2, 'fish-fresh', 6)`,
      [CHARACTER, BOAT],
    );
    const engine = fakeEngine({ unitPrice: 10, feeRate: 0.1 });
    const service = new TradeService(fakeRuntime(engine), new PostgresTradeRepository(pool));

    await expect(
      service.execute(CHARACTER, request({ action: 'sell', quantity: 7, idempotencyKey: 'trade:oversell' })),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_CARGO' });

    const result = await service.execute(
      CHARACTER,
      request({ action: 'sell', quantity: 6, idempotencyKey: 'trade:sell-ok' }),
    );
    // gross 60, fee 6, net 54
    expect(result).toMatchObject({ total: 54, fee: 6, coins: 154, cargo: [] });
    const cargo = await pool.query('select * from player_cargo');
    expect(cargo.rows).toHaveLength(0);
    expect(engine.applied).toEqual([{ action: 'sell', quantity: 6 }]);
  });

  it('replays the same idempotency key without duplicating coins, cargo, or stock', async () => {
    const pool = await seededPool(1_000);
    const engine = fakeEngine({ unitPrice: 25 });
    const service = new TradeService(fakeRuntime(engine), new PostgresTradeRepository(pool));

    const first = await service.execute(CHARACTER, request());
    const replay = await service.execute(CHARACTER, request());

    expect(first.coins).toBe(900);
    expect(replay).toMatchObject({ coins: 900, idempotentReplay: true });
    expect(await coinsOf(pool)).toBe(900);
    const audit = await pool.query('select * from trade_transactions');
    expect(audit.rows).toHaveLength(1);
    // คลังเมืองถูกหักครั้งเดียว
    expect(engine.applied).toHaveLength(1);
  });

  it('rejects reuse of an idempotency key with a different payload', async () => {
    const pool = await seededPool(1_000);
    const service = new TradeService(fakeRuntime(fakeEngine()), new PostgresTradeRepository(pool));

    await service.execute(CHARACTER, request());
    await expect(
      service.execute(CHARACTER, request({ quantity: 9 })),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it('requires an active boat before trading cargo', async () => {
    const pool = await seededPool();
    await pool.query('delete from player_boats where character_id = $1', [CHARACTER]);
    const service = new TradeService(fakeRuntime(fakeEngine()), new PostgresTradeRepository(pool));

    await expect(service.execute(CHARACTER, request())).rejects.toBeInstanceOf(TradeRejectedError);
  });
});
