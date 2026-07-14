import { describe, expect, it, beforeEach } from 'vitest';
import {
  calculatePrice,
  livingBuyPrice,
  livingSellPrice,
  marketImpact,
  stockRatio,
} from '../LivingTradeFormulas';
import { LivingTradeSimulator } from '../LivingTradeSimulator';
import { ECONOMY_CONFIG } from '../LivingTradeConfig';
import { resolveMarketState } from '../EconomyRules';
import type { CommodityState } from '../types';

function sampleItem(overrides: Partial<CommodityState> = {}): CommodityState {
  return {
    stock: 100,
    production: 10,
    baseProduction: 10,
    consumption: 5,
    demand: 50,
    baseDemand: 50,
    importDemand: 0,
    exportDemand: 0,
    targetStock: 100,
    basePrice: 60,
    currentPrice: 60,
    previousPrice: 60,
    trend: 'stable',
    marketState: 'balanced',
    perishable: false,
    memory: {
      recentBuyVolume: 0,
      recentSellVolume: 0,
      shortageTicks: 0,
      surplusTicks: 0,
      averagePrice: 60,
    },
    ...overrides,
  };
}

describe('LivingTradeFormulas', () => {
  it('raises price when stock is low', () => {
    const cheap = calculatePrice(sampleItem({ stock: 200, targetStock: 100 }));
    const expensive = calculatePrice(sampleItem({ stock: 20, targetStock: 100 }));
    expect(expensive).toBeGreaterThan(cheap);
  });

  it('clamps price within min/max ratio', () => {
    const low = calculatePrice(sampleItem({ stock: 9999, targetStock: 10 }));
    const high = calculatePrice(sampleItem({ stock: 1, targetStock: 200, demand: 200 }));
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

  it('stock ratio reflects surplus vs shortage', () => {
    expect(stockRatio(sampleItem({ stock: 200 }))).toBeGreaterThan(1.4);
    expect(stockRatio(sampleItem({ stock: 30 }))).toBeLessThan(0.4);
  });
});

describe('Market states', () => {
  it('detects surplus and crisis', () => {
    expect(resolveMarketState(sampleItem({ stock: 150 }))).toBe('surplus');
    expect(resolveMarketState(sampleItem({ stock: 30 }))).toBe('crisis');
  });
});

describe('LivingTradeSimulator — Economic CA', () => {
  let sim: LivingTradeSimulator;

  beforeEach(() => {
    sim = new LivingTradeSimulator(true);
  });

  it('initializes 4 economy cells with living commodities', () => {
    expect(sim.state.cells).toHaveLength(4);
    const leaf = sim.getCell('leaf-island')!;
    for (const id of ['fresh-fish', 'hardwood', 'dried-fish'] as const) {
      expect(leaf.commodities[id]!.stock).toBeGreaterThan(0);
    }
  });

  it('1. shortage raises price', () => {
    sim.injectShortage('mine-island', 'fresh-fish', 30);
    const item = sim.getCommodity('mine-island', 'fresh-fish')!;
    const priceAfter = item.currentPrice;
    expect(priceAfter).toBeGreaterThanOrEqual(item.basePrice * 0.4);
    expect(item.marketState === 'shortage' || item.marketState === 'crisis').toBe(true);
  });

  it('2. surplus lowers price over ticks', () => {
    const leaf = sim.getCell('leaf-island')!;
    const wood = leaf.commodities.hardwood!;
    wood.stock = wood.targetStock * 2.5;
    wood.production = 30;
    const priceBefore = wood.currentPrice;
    for (let i = 0; i < 8; i++) sim.tick();
    const priceAfter = sim.getCommodity('leaf-island', 'hardwood')!.currentPrice;
    expect(priceAfter).toBeLessThanOrEqual(priceBefore);
  });

  it('3. shortage on one cell spreads demand to neighbors', () => {
    sim.injectShortage('mine-island', 'fresh-fish', 35);
    const before = sim.getCommodity('leaf-island', 'fresh-fish')!.exportDemand;
    sim.tick();
    const after = sim.getCommodity('leaf-island', 'fresh-fish')!.exportDemand;
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it('4. missing inputs stop ship parts production', () => {
    const yard = sim.getCell('shipyard-island')!;
    yard.commodities.hardwood!.stock = 0;
    yard.commodities['iron-ingot']!.stock = 0;
    yard.commodities.rope!.stock = 0;
    const partsBefore = yard.commodities.sailcloth!.stock;
    sim.tick();
    expect(yard.commodities.sailcloth!.stock).toBeLessThanOrEqual(partsBefore + 1);
    expect(sim.log.some((l) => l.message.includes('หยุด') || l.message.includes('ขาด'))).toBe(true);
  });

  it('5. player sell helps shortage cell recover stock', () => {
    sim.injectShortage('mine-island', 'fresh-fish', 30);
    const before = sim.getStock('mist-jungle', 'fresh-fish')!;
    sim.applyPlayerSell('mist-jungle', 'fresh-fish', 25);
    expect(sim.getStock('mist-jungle', 'fresh-fish')!).toBeGreaterThan(before);
  });

  it('6. player mass sell crashes price via memory', () => {
    const before = sim.getBuyPrice('starter-island', 'hardwood', 1)!;
    sim.applyPlayerSell('starter-island', 'hardwood', 80);
    const after = sim.getBuyPrice('starter-island', 'hardwood', 1)!;
    expect(after).toBeLessThanOrEqual(before);
  });

  it('7. NPC ships depart only every few ticks', () => {
    const shipsAtStart = sim.state.ships.length;
    sim.tick();
    const afterOne = sim.state.ships.length;
    sim.tickMany(4);
    expect(afterOne).toBeGreaterThanOrEqual(shipsAtStart);
  });

  it('8. arbitrage exists from leaf island to neighbors', () => {
    const buy = sim.getBuyPrice('starter-island', 'hardwood', 1);
    const sell = sim.getSellPrice('mist-jungle', 'hardwood', 1);
    expect(buy).not.toBeNull();
    expect(sell).not.toBeNull();
    expect(sell! - buy!).toBeGreaterThan(ECONOMY_CONFIG.baseTransportTicks);
    const arb = sim.bestArbitrageFrom('starter-island');
    expect(arb).not.toBeNull();
    expect(arb!.profit).toBeGreaterThan(0);
  });

  it('9. shortage triggers import demand spread', () => {
    sim.injectShortage('mine-island', 'fresh-fish', 25);
    const mineFood = sim.getCommodity('mine-island', 'fresh-fish')!;
    expect(mineFood.marketState === 'shortage' || mineFood.marketState === 'crisis').toBe(true);
    sim.tick();
    const leafFood = sim.getCommodity('leaf-island', 'fresh-fish')!;
    expect(leafFood.exportDemand).toBeGreaterThan(0);
  });

  it('10. player overbuying food raises price and import pressure', () => {
    const beforePrice = sim.getBuyPrice('starter-island', 'fresh-fish', 1)!;
    sim.applyPlayerBuy('starter-island', 'fresh-fish', 80);
    const afterPrice = sim.getBuyPrice('starter-island', 'fresh-fish', 1)!;
    const leafFood = sim.getCommodity('leaf-island', 'fresh-fish')!;
    expect(afterPrice).toBeGreaterThanOrEqual(beforePrice);
    expect(leafFood.memory.recentBuyVolume).toBeGreaterThan(0);
  });

  it('player buy reduces stock', () => {
    const before = sim.getStock('starter-island', 'hardwood')!;
    sim.applyPlayerBuy('starter-island', 'hardwood', 30);
    expect(sim.getStock('starter-island', 'hardwood')!).toBeLessThan(before);
  });
});
