import { describe, expect, it } from 'vitest';
import {
  ISLAND_MARKETS,
  TRADE_COMMODITIES,
  TRADE_ROUTES,
  TRADE_VENDORS,
} from '../databook';
import {
  arbitrageProfitPerUnit,
  buyPrice,
  cargoSlotsUsed,
  sellPrice,
} from '../TradeFormulas';
import {
  getMarketForIsland,
  listRoutesFromIsland,
  listVendorsOnIsland,
} from '../TradeRegistry';

describe('Trade databook', () => {
  it('defines commodities for inter-island trade', () => {
    expect(TRADE_COMMODITIES.length).toBeGreaterThanOrEqual(10);
    expect(TRADE_COMMODITIES.some((c) => c.id === 'fresh-fish')).toBe(true);
  });

  it('defines market per island', () => {
    expect(ISLAND_MARKETS).toHaveLength(3);
    expect(getMarketForIsland('mist-jungle')?.id).toBe('mist-jungle-market');
  });

  it('has cheaper buy on export island', () => {
    const fish = TRADE_COMMODITIES.find((c) => c.id === 'fresh-fish')!;
    const starter = getMarketForIsland('starter-island')!;
    const desert = getMarketForIsland('sunscar-desert')!;
    const starterEntry = starter.entries.find((e) => e.commodityId === 'fresh-fish')!;
    const desertEntry = desert.entries.find((e) => e.commodityId === 'fresh-fish')!;
    expect(buyPrice(fish, starterEntry)).toBeLessThan(buyPrice(fish, desertEntry));
  });

  it('calculates positive arbitrage for fish starter to desert', () => {
    const fish = TRADE_COMMODITIES.find((c) => c.id === 'fresh-fish')!;
    const starterEntry = getMarketForIsland('starter-island')!.entries.find(
      (e) => e.commodityId === 'fresh-fish',
    )!;
    const desertEntry = getMarketForIsland('sunscar-desert')!.entries.find(
      (e) => e.commodityId === 'fresh-fish',
    )!;
    const profit = arbitrageProfitPerUnit(fish, starterEntry, desertEntry);
    expect(profit).toBeGreaterThan(0);
  });

  it('lists trade routes from starter island', () => {
    expect(listRoutesFromIsland('starter-island').length).toBeGreaterThanOrEqual(2);
    expect(TRADE_ROUTES.some((r) => r.id === 'starter-to-mist')).toBe(true);
  });

  it('assigns vendors to each island', () => {
    expect(listVendorsOnIsland('starter-island').length).toBeGreaterThanOrEqual(2);
    expect(TRADE_VENDORS.length).toBeGreaterThanOrEqual(6);
  });

  it('applies sell fee in sell price', () => {
    const herb = TRADE_COMMODITIES.find((c) => c.id === 'jungle-herb')!;
    const entry = getMarketForIsland('mist-jungle')!.entries.find(
      (e) => e.commodityId === 'jungle-herb',
    )!;
    const sell = sellPrice(herb, entry);
    const gross = Math.floor(herb.basePrice * entry.sellMultiplier);
    expect(sell).toBeLessThanOrEqual(gross);
  });

  it('counts cargo slots by stack', () => {
    expect(cargoSlotsUsed([{ commodityId: 'fresh-fish', quantity: 50 }], 99)).toBe(1);
    expect(cargoSlotsUsed([{ commodityId: 'fresh-fish', quantity: 100 }], 99)).toBe(2);
  });
});
