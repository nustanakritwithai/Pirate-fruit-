import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFreshWorld } from '../LivingTradePersistence';
import { ensureCommodityCoverage, LIVING_COMMODITY_IDS } from '../LivingTradeConfig';
import { moveCargo, scheduleImportConvoys } from '../EconomyRules';
import { TradeManager } from '../../TradeManager';
import { LivingTradeSimulator } from '../LivingTradeSimulator';

describe('Worldwide island economy', () => {
  beforeEach(() => {
    const memory = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
    });
  });

  it('creates a producing cell and non-zero imported stock for every island', () => {
    const world = createFreshWorld();
    expect(world.cells).toHaveLength(7);
    expect(world.routes.some((route) =>
      route.sourceCellId === 'volcano-island' && route.targetCellId === 'leaf-island')).toBe(true);

    for (const cell of world.cells) {
      for (const commodityId of LIVING_COMMODITY_IDS) {
        expect(cell.commodities[commodityId]?.stock ?? 0).toBeGreaterThan(0);
      }
    }
    expect(world.cells.find((cell) => cell.id === 'frost-island')?.commodities['frost-crystal']?.baseProduction)
      .toBeGreaterThan(0);
    expect(world.cells.find((cell) => cell.id === 'sky-island')?.commodities['storm-core']?.baseProduction)
      .toBeGreaterThan(0);
    expect(world.cells.find((cell) => cell.id === 'volcano-island')?.commodities['volcanic-ore']?.baseProduction)
      .toBeGreaterThan(0);
  });

  it('starts with more independent transport groups and production units', () => {
    const world = createFreshWorld();
    expect(world.traders.length).toBeGreaterThanOrEqual(12);
    expect(new Set(world.traders.map((trader) => trader.id)).size).toBe(world.traders.length);
    expect(world.factories.length).toBeGreaterThanOrEqual(24);
    expect(new Set(world.factories.map((factory) => factory.id)).size).toBe(world.factories.length);
    expect(world.cells.every((cell) => cell.productionUnits >= 2)).toBe(true);
    expect(world.cells.every((cell) => cell.transportCapacity >= 2)).toBe(true);
  });

  it('dispatches and delivers an import convoy when a market is empty', () => {
    const world = createFreshWorld();
    ensureCommodityCoverage(world.cells);
    for (const cell of world.cells) {
      for (const item of Object.values(cell.commodities)) {
        if (item) item.stock = item.targetStock;
      }
    }
    const frost = world.cells.find((cell) => cell.id === 'frost-island')!;
    frost.commodities['fresh-fish']!.stock = 0;
    world.cells.find((cell) => cell.id === 'leaf-island')!.commodities['fresh-fish']!.stock = 220;

    const log = [] as import('../types').EconomyLogEntry[];
    scheduleImportConvoys(world, log);
    expect(world.ships.some((ship) =>
      ship.destinationCellId === 'frost-island' && ship.cargo['fresh-fish'])).toBe(true);

    moveCargo(world, log);
    moveCargo(world, log);
    expect(frost.commodities['fresh-fish']!.stock).toBeGreaterThan(0);
    expect(log.some((entry) => entry.message.includes('ถึงเกาะเหมันต์คราม'))).toBe(true);
  });

  it('lets the ship cargo buy and sell imported goods on advanced islands', () => {
    const wallet = {
      coins: 100_000,
      spendCoins(amount: number) {
        if (this.coins < amount) return false;
        this.coins -= amount;
        return true;
      },
      addCoins(amount: number) {
        this.coins += amount;
      },
    };
    const living = new LivingTradeSimulator(true);
    const trade = new TradeManager(wallet, 'swift-sloop', living);
    const before = living.getStock('azure-frost', 'storm-core')!;
    const bought = trade.buy('azure-frost', 'storm-core', 1);

    expect(bought.ok).toBe(true);
    expect(living.getStock('azure-frost', 'storm-core')).toBeLessThan(before);
    expect(trade.hold.slots.some((slot) => slot.commodityId === 'storm-core')).toBe(true);

    const sold = trade.sell('tempest-sky', 'storm-core', 1);
    expect(sold.ok).toBe(true);
    expect(trade.hold.slots.some((slot) => slot.commodityId === 'storm-core')).toBe(false);
  });
});
