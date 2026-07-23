import { afterEach, describe, expect, it, beforeEach, vi } from 'vitest';
import { REMOTE_TRADE_FLUSH_TIMEOUT_MS, TradeManager } from '../TradeManager';
import type { GameStorage } from '../../persistence/GameStorage';
import { essentialReserveStock } from '../living/LivingTradeConfig';

const memory = new Map<string, string>();

function makeWallet(start = 10_000) {
  let coins = start;
  return {
    get coins() { return coins; },
    spendCoins(amount: number) {
      if (coins < amount) return false;
      coins -= amount;
      return true;
    },
    addCoins(amount: number) {
      coins += amount;
    },
  };
}

beforeEach(() => {
  memory.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, value); },
    removeItem: (key: string) => { memory.delete(key); },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TradeManager', () => {

  it('buys export goods on starter island', () => {
    const wallet = makeWallet();
    const trade = new TradeManager(wallet);
    const result = trade.buy('starter-island', 'fresh-fish', 5);
    expect(result.ok).toBe(true);
    expect(wallet.coins).toBeLessThan(10_000);
    expect(trade.hold.slots.find((s) => s.commodityId === 'fresh-fish')?.quantity).toBe(5);
    expect(trade.living.getStock('starter-island', 'fresh-fish')).toBeLessThan(160);
  });

  it('sells with profit on import island', () => {
    const wallet = makeWallet();
    const trade = new TradeManager(wallet);
    trade.buy('starter-island', 'fresh-fish', 10);
    const afterBuy = wallet.coins;
    const sell = trade.sell('sunscar-desert', 'fresh-fish', 10);
    expect(sell.ok).toBe(true);
    expect(wallet.coins).toBeGreaterThan(afterBuy);
  });

  it('rejects sell when cargo empty', () => {
    const wallet = makeWallet();
    const trade = new TradeManager(wallet);
    const result = trade.sell('starter-island', 'fresh-fish', 1);
    expect(result.ok).toBe(false);
  });

  it('updates boat cargo capacity', () => {
    const trade = new TradeManager(makeWallet());
    trade.setBoat('swift-sloop');
    expect(trade.hold.maxSlots).toBe(12);
    expect(trade.hold.maxWeight).toBe(180);
  });

  it('does not let normal purchases consume the city subsistence reserve', () => {
    const trade = new TradeManager(makeWallet());
    const fish = trade.living.getCommodity('leaf-island', 'fresh-fish')!;
    const reserve = essentialReserveStock('fresh-fish', fish.targetStock);
    fish.stock = reserve + 2;

    const blocked = trade.buy('starter-island', 'fresh-fish', 3);

    expect(blocked.ok).toBe(false);
    expect(fish.stock).toBe(reserve + 2);
    expect(blocked.message).toContain('คลังยังชีพ');
  });

  it('releases a remote transaction when the pre-trade save queue hangs', async () => {
    vi.useFakeTimers();
    const storage: GameStorage = {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => { memory.set(key, value); },
      removeItem: (key) => { memory.delete(key); },
      flush: () => new Promise<void>(() => undefined),
    };
    const execute = vi.fn();
    const trade = new TradeManager(makeWallet(), 'training-dinghy', undefined, storage);
    trade.setRemoteExecutor({ execute });

    const pending = trade.buyAsync('starter-island', 'fresh-fish', 1);
    await vi.advanceTimersByTimeAsync(REMOTE_TRADE_FLUSH_TIMEOUT_MS);
    const result = await pending;

    expect(result).toMatchObject({ ok: false });
    expect(result.message).toContain('บันทึกสถานะเรือไม่ทัน');
    expect(execute).not.toHaveBeenCalled();
  });
});
