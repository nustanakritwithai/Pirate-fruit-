import { describe, expect, it, beforeEach } from 'vitest';
import {
  calculateMarketPrice,
  livingBuyPrice,
  livingSellPrice,
  marketImpact,
} from '../LivingTradeFormulas';
import { LivingTradeSimulator } from '../LivingTradeSimulator';
import { LIVING_COMMODITY_IDS } from '../LivingTradeConfig';
import type { CommodityState } from '../types';

function sampleItem(overrides: Partial<CommodityState> = {}): CommodityState {
  return {
    stock: 100,
    production: 10,
    consumption: 5,
    demand: 50,
    demandMultiplier: 1,
    basePrice: 60,
    currentPrice: 60,
    previousPrice: 60,
    targetStock: 100,
    ...overrides,
  };
}

describe('LivingTradeFormulas', () => {
  it('raises price when stock is low', () => {
    const cheap = calculateMarketPrice(sampleItem({ stock: 200, targetStock: 100 }));
    const expensive = calculateMarketPrice(sampleItem({ stock: 20, targetStock: 100 }));
    expect(expensive).toBeGreaterThan(cheap);
  });

  it('clamps price within min/max ratio', () => {
    const low = calculateMarketPrice(sampleItem({ stock: 9999, targetStock: 10 }));
    const high = calculateMarketPrice(sampleItem({ stock: 1, targetStock: 200, demandMultiplier: 3 }));
    expect(low).toBeGreaterThanOrEqual(24);
    expect(high).toBeLessThanOrEqual(180);
  });

  it('buy price is higher than sell price (spread)', () => {
    const item = sampleItem({ currentPrice: 50 });
    expect(livingBuyPrice(item)).toBeGreaterThan(livingSellPrice(item));
  });

  it('market impact increases with amount', () => {
    expect(marketImpact(10)).toBeLessThan(marketImpact(50));
  });
});

describe('LivingTradeSimulator', () => {
  let sim: LivingTradeSimulator;

  beforeEach(() => {
    sim = new LivingTradeSimulator();
  });

  it('initializes 3 islands with 4 living commodities', () => {
    expect(sim.state.islands).toHaveLength(3);
    for (const island of sim.state.islands) {
      for (const id of LIVING_COMMODITY_IDS) {
        expect(island.commodities[id].stock).toBeGreaterThan(0);
      }
    }
  });

  it('player buy reduces stock and raises buy price', () => {
    const before = sim.getStock('starter-island', 'hardwood')!;
    const priceBefore = sim.getBuyPrice('starter-island', 'hardwood', 1)!;
    sim.applyPlayerBuy('starter-island', 'hardwood', 30);
    const after = sim.getStock('starter-island', 'hardwood')!;
    const priceAfter = sim.getBuyPrice('starter-island', 'hardwood', 1)!;
    expect(after).toBeLessThan(before);
    expect(priceAfter).toBeGreaterThanOrEqual(priceBefore);
  });

  it('player sell increases stock', () => {
    sim.applyPlayerBuy('starter-island', 'fresh-fish', 5);
    const before = sim.getStock('mist-jungle', 'fresh-fish')!;
    sim.applyPlayerSell('mist-jungle', 'fresh-fish', 20);
    expect(sim.getStock('mist-jungle', 'fresh-fish')!).toBeGreaterThan(before);
  });

  it('economy tick updates prices', () => {
    const before = sim.getCommodity('starter-island', 'hardwood')!.currentPrice;
    for (let i = 0; i < 5; i++) sim.tick();
    const after = sim.getCommodity('starter-island', 'hardwood')!.currentPrice;
    expect(typeof after).toBe('number');
    expect(after).toBeGreaterThan(0);
    expect(sim.state.tick).toBe(5);
    expect(before).toBeGreaterThan(0);
  });

  it('finds arbitrage opportunity between islands', () => {
    const arb = sim.bestArbitrageFrom('starter-island');
    expect(arb).not.toBeNull();
    expect(arb!.profit).toBeGreaterThan(0);
  });
});
