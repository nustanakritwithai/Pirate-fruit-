import { describe, expect, it, vi } from 'vitest';
import type { TradeExecuteResponse } from '@pirate-fruit/shared';
import { TradeManager, type TradeWallet } from '../TradeManager';
import {
  createRemoteTradeExecutor,
  RemoteTradeError,
  type RemoteTradeExecutor,
  type TradeFetch,
} from '../RemoteTradeClient';
import type { GameStorage } from '../../persistence/GameStorage';

class MemoryStorage implements GameStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function fakeWallet(initial: number): TradeWallet & { coins: number } {
  return {
    coins: initial,
    spendCoins(amount: number): boolean {
      if (this.coins < amount) return false;
      this.coins -= amount;
      return true;
    },
    addCoins(amount: number): void {
      this.coins += amount;
    },
  };
}

function response(overrides: Partial<TradeExecuteResponse> = {}): TradeExecuteResponse {
  return {
    ok: true,
    schemaVersion: 1,
    action: 'buy',
    islandId: 'starter-island',
    commodityId: 'fresh-fish',
    quantity: 3,
    unitPrice: 10,
    total: 30,
    fee: 0,
    coins: 970,
    cargo: [{ commodityId: 'fresh-fish', quantity: 3 }],
    idempotentReplay: false,
    ...overrides,
  };
}

describe('S8 remote trade (client)', () => {
  it('applies the server outcome: coin delta, canonical cargo, listener event', async () => {
    const wallet = fakeWallet(1_000);
    const executor: RemoteTradeExecutor = { execute: vi.fn(async () => response()) };
    const trade = new TradeManager(wallet, 'training-dinghy', undefined, new MemoryStorage());
    trade.setRemoteExecutor(executor);
    const events: unknown[] = [];
    trade.onTransaction((event) => events.push(event));

    const result = await trade.buyAsync('starter-island', 'fresh-fish', 3);

    expect(result.ok).toBe(true);
    expect(wallet.coins).toBe(970);
    expect(trade.hold.slots).toEqual([{ commodityId: 'fresh-fish', quantity: 3 }]);
    expect(events).toHaveLength(1);
  });

  it('leaves local state untouched when the server rejects the intent', async () => {
    const wallet = fakeWallet(500);
    const executor: RemoteTradeExecutor = {
      execute: vi.fn(async () => {
        throw new RemoteTradeError('INSUFFICIENT_STOCK', 'stock is low');
      }),
    };
    const trade = new TradeManager(wallet, 'training-dinghy', undefined, new MemoryStorage());
    trade.setRemoteExecutor(executor);

    const result = await trade.buyAsync('starter-island', 'fresh-fish', 3);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('สต็อก');
    expect(wallet.coins).toBe(500);
    expect(trade.hold.slots).toEqual([]);
  });

  it('sells through the server and credits the net gain', async () => {
    const wallet = fakeWallet(100);
    const executor: RemoteTradeExecutor = {
      execute: vi.fn(async () => response({
        action: 'sell',
        total: 54,
        fee: 6,
        coins: 154,
        cargo: [],
      })),
    };
    const storage = new MemoryStorage();
    storage.setItem(
      'pirate-fruit:cargo-v1',
      JSON.stringify({ maxSlots: 8, maxWeight: 120, slots: [{ commodityId: 'fresh-fish', quantity: 6 }] }),
    );
    const trade = new TradeManager(wallet, 'training-dinghy', undefined, storage);
    trade.setRemoteExecutor(executor);

    const result = await trade.sellAsync('starter-island', 'fresh-fish', 6);

    expect(result.ok).toBe(true);
    expect(wallet.coins).toBe(154);
    expect(trade.hold.slots).toEqual([]);
  });

  it('reconciles a stale wallet exactly to the server for buys and replays', async () => {
    const wallet = fakeWallet(5_000);
    const executor: RemoteTradeExecutor = {
      execute: vi.fn(async () => response({ coins: 970, idempotentReplay: true })),
    };
    const trade = new TradeManager(wallet, 'training-dinghy', undefined, new MemoryStorage());
    trade.setRemoteExecutor(executor);

    await trade.buyAsync('starter-island', 'fresh-fish', 3);

    expect(wallet.coins).toBe(970);
  });

  it('reconciles a wallet that is behind the server after a sell', async () => {
    const wallet = fakeWallet(10);
    const executor: RemoteTradeExecutor = {
      execute: vi.fn(async () => response({ action: 'sell', coins: 154, cargo: [] })),
    };
    const trade = new TradeManager(wallet, 'training-dinghy', undefined, new MemoryStorage());
    trade.setRemoteExecutor(executor);

    await trade.sellAsync('starter-island', 'fresh-fish', 3);

    expect(wallet.coins).toBe(154);
  });

  it('keeps the same idempotency key when retrying a 503', async () => {
    const bodies: { idempotencyKey: string }[] = [];
    let calls = 0;
    const fetcher: TradeFetch = async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)) as { idempotencyKey: string });
      calls += 1;
      if (calls === 1) return new Response('{}', { status: 503 });
      return Response.json(response());
    };
    const executor = createRemoteTradeExecutor('https://api.example', 'csrf-token', fetcher);

    const outcome = await executor.execute({
      action: 'buy',
      islandId: 'starter-island',
      commodityId: 'fresh-fish',
      quantity: 3,
    });

    expect(outcome.coins).toBe(970);
    expect(bodies).toHaveLength(2);
    expect(bodies[0].idempotencyKey).toBe(bodies[1].idempotencyKey);
  });

  it('sends the CSRF header and maps server reject codes', async () => {
    let seenCsrf: string | null = null;
    const fetcher: TradeFetch = async (_input, init) => {
      seenCsrf = new Headers(init?.headers).get('x-csrf-token');
      return Response.json(
        { ok: false, error: { code: 'PRICE_MOVED', message: 'moved' } },
        { status: 409 },
      );
    };
    const executor = createRemoteTradeExecutor('https://api.example', 'csrf-abc', fetcher);

    await expect(
      executor.execute({ action: 'buy', islandId: 'a', commodityId: 'fresh-fish', quantity: 1 }),
    ).rejects.toMatchObject({ code: 'PRICE_MOVED' });
    expect(seenCsrf).toBe('csrf-abc');
  });
});
