import { describe, expect, it } from 'vitest';
import {
  ISLAND_MARKETS,
  TRADE_COMMODITIES,
  TRADE_ROUTES,
  TRADE_VENDORS,
} from '../databook';
import { cargoSlotsUsed, sellPrice } from '../TradeFormulas';
import {
  findMarketEntryOnIsland,
  getMarketForIsland,
  listRoutesFromIsland,
  listVendorsOnIsland,
} from '../TradeRegistry';

describe('Trade databook', () => {
  it('defines commodities for inter-island trade', () => {
    expect(TRADE_COMMODITIES.length).toBeGreaterThanOrEqual(10);
    expect(TRADE_COMMODITIES.some((c) => c.id === 'fresh-fish')).toBe(true);
    expect(TRADE_COMMODITIES.some((c) => c.id === 'iron-ore')).toBe(true);
  });

  it('defines living markets per island role', () => {
    expect(ISLAND_MARKETS).toHaveLength(7);
    expect(getMarketForIsland('mist-jungle')?.id).toBe('mist-jungle-market');
    expect(getMarketForIsland('azure-frost')?.id).toBe('azure-frost-market');
    expect(getMarketForIsland('tempest-sky')?.id).toBe('tempest-sky-market');
    expect(getMarketForIsland('ember-volcano')?.id).toBe('ember-volcano-market');
    expect(findMarketEntryOnIsland('starter-island', 'sailcloth')?.market.id)
      .toBe('starter-shipyard-market');
  });

  it('lists living commodities on leaf island market', () => {
    const starter = getMarketForIsland('starter-island')!;
    expect(starter.entries.some((e) => e.commodityId === 'fresh-fish')).toBe(true);
    expect(starter.entries.some((e) => e.commodityId === 'hardwood')).toBe(true);
  });

  it('lists trade routes from starter island', () => {
    expect(listRoutesFromIsland('starter-island').length).toBeGreaterThanOrEqual(2);
    expect(TRADE_ROUTES.some((r) => r.id === 'starter-to-mist')).toBe(true);
  });

  it('assigns vendors to each island', () => {
    expect(listVendorsOnIsland('starter-island').length).toBeGreaterThanOrEqual(2);
    expect(TRADE_VENDORS.length).toBe(12);
    expect(TRADE_VENDORS.some((v) => v.id === 'vendor-starter-shipyard')).toBe(true);
  });

  it('applies sell fee in sell price', () => {
    const fish = TRADE_COMMODITIES.find((c) => c.id === 'fresh-fish')!;
    const entry = getMarketForIsland('mist-jungle')!.entries.find(
      (e) => e.commodityId === 'fresh-fish',
    )!;
    const sell = sellPrice(fish, entry);
    const gross = Math.floor(fish.basePrice * entry.sellMultiplier);
    expect(sell).toBeLessThanOrEqual(gross);
  });

  it('counts cargo slots by stack', () => {
    expect(cargoSlotsUsed([{ commodityId: 'fresh-fish', quantity: 50 }], 99)).toBe(1);
    expect(cargoSlotsUsed([{ commodityId: 'fresh-fish', quantity: 100 }], 99)).toBe(2);
  });
});
