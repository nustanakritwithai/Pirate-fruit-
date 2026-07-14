import { describe, expect, it } from 'vitest';
import {
  LIVING_ECONOMY_BOUNDS,
  mergeNewsBatch,
  prependBounded,
  pushBounded,
  trimEconomyWorldState,
} from '../LivingEconomyBounds';
import { createFreshWorld } from '../LivingTradePersistence';
import type { TradeNewsItem } from '../types';

function sampleNews(id: string, message: string, cellId = 'leaf-island'): TradeNewsItem {
  return {
    id,
    message,
    cellId: cellId as TradeNewsItem['cellId'],
    commodityId: 'hardwood',
    createdAt: Date.now(),
    ttlMs: 90_000,
  };
}

describe('Living Economy bounds', () => {
  it('pushBounded keeps maximum length', () => {
    const list: number[] = [];
    for (let i = 0; i < 10; i++) pushBounded(list, i, 5);
    expect(list).toEqual([5, 6, 7, 8, 9]);
  });

  it('prependBounded keeps newest first', () => {
    const out = prependBounded([3, 2, 1], [9, 8], 4);
    expect(out).toEqual([9, 8, 3, 2]);
  });

  it('mergeNewsBatch deduplicates similar headlines', () => {
    const existing = [sampleNews('a', 'เกาะใบไม้ขาดไม้เนื้อแข็งต่อเนื่อง 3 รอบ')];
    const merged = mergeNewsBatch(
      existing,
      [sampleNews('b', 'เกาะใบไม้ขาดไม้เนื้อแข็งต่อเนื่อง 4 รอบ')],
      LIVING_ECONOMY_BOUNDS.maxNewsEntries,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].message).toContain('4 รอบ');
  });

  it('trimEconomyWorldState caps log, news, and archived orders', () => {
    const world = createFreshWorld();
    world.log = Array.from({ length: 300 }, (_, i) => ({
      tick: i,
      message: `log-${i}`,
    }));
    world.news = Array.from({ length: 150 }, (_, i) => sampleNews(`n-${i}`, `news-${i}`));
    world.orders = [
      ...Array.from({ length: 200 }, (_, i) => ({
        id: `arch-${i}`,
        commodityId: 'rope' as const,
        sourceIslandId: 'cloth-island' as const,
        destinationIslandId: 'shipyard-island' as const,
        requestedAmount: 1,
        remainingAmount: 0,
        sourceBuyPrice: 1,
        destinationSellPrice: 2,
        expectedRevenue: 2,
        purchaseCost: 1,
        transportCost: 0,
        riskCost: 0,
        spoilageCost: 0,
        expectedProfit: 1,
        profitPerCargoSlot: 1,
        urgency: 0.5,
        travelTicks: 1,
        createdTick: 0,
        expiresAtTick: 1,
        status: 'completed' as const,
      })),
      {
        id: 'active-1',
        commodityId: 'rope',
        sourceIslandId: 'cloth-island',
        destinationIslandId: 'shipyard-island',
        requestedAmount: 5,
        remainingAmount: 5,
        sourceBuyPrice: 1,
        destinationSellPrice: 2,
        expectedRevenue: 10,
        purchaseCost: 5,
        transportCost: 0,
        riskCost: 0,
        spoilageCost: 0,
        expectedProfit: 5,
        profitPerCargoSlot: 1,
        urgency: 0.5,
        travelTicks: 1,
        createdTick: 0,
        expiresAtTick: 99,
        status: 'open',
      },
    ];
    trimEconomyWorldState(world);
    expect(world.log.length).toBeLessThanOrEqual(LIVING_ECONOMY_BOUNDS.maxEconomyLogEntries);
    expect(world.news.length).toBeLessThanOrEqual(LIVING_ECONOMY_BOUNDS.maxNewsEntries);
    expect(world.orders.some((o) => o.id === 'active-1')).toBe(true);
    expect(world.orders.length).toBeLessThanOrEqual(1 + LIVING_ECONOMY_BOUNDS.maxArchivedOrders);
  });
});
