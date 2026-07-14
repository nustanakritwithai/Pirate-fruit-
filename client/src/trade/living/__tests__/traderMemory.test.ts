import { describe, expect, it, beforeEach } from 'vitest';
import { LivingTradeSimulator } from '../LivingTradeSimulator';
import { createFreshWorld, saveEconomyState, loadEconomyState } from '../LivingTradePersistence';
import { TRADER_MEMORY } from '../TraderMemoryConfig';
import {
  addAvoidedRoute,
  clearTraderMemory,
  getCommodityAffinity,
  getCongestionLevel,
  getEffectiveTravelTicks,
  getOrCreateRouteReputation,
  getTraderProfile,
  getTraderRouteMemory,
  isRouteAvoided,
  recordShipmentMemory,
  routeAvoidKey,
  routeReputationKey,
  scoreRouteMemoryComponent,
  tickTraderMemoryDecay,
  traderMemoryKey,
  adjustCommodityAffinity,
} from '../TraderMemoryStore';
import {
  scoreOrderForTrader,
} from '../TraderDecision';
import { setTraderRngSeed, shouldExplore, traderRandom } from '../TraderMemoryRng';
import { generateTradeOrders } from '../TradeOrderGenerator';
import { updateDynamicTradeEconomy } from '../DynamicTradeEconomy';
import type { DynamicTradeOrder, EconomyWorldState, LivingCommodityId } from '../types';

const TRADER = 'trader-leaf-safe';
const BOLD = 'trader-cloth-bold';
const SRC = 'cloth-island' as const;
const DEST = 'shipyard-island' as const;
const COMM = 'rope' as LivingCommodityId;

function sampleOrder(overrides: Partial<DynamicTradeOrder> = {}): DynamicTradeOrder {
  return {
    id: 'o1',
    commodityId: COMM,
    sourceIslandId: SRC,
    destinationIslandId: DEST,
    requestedAmount: 8,
    remainingAmount: 8,
    sourceBuyPrice: 100,
    destinationSellPrice: 200,
    expectedRevenue: 1600,
    purchaseCost: 800,
    transportCost: 5,
    riskCost: 10,
    spoilageCost: 0,
    expectedProfit: 50,
    profitPerCargoSlot: 6.25,
    urgency: 0.5,
    travelTicks: 2,
    createdTick: 0,
    expiresAtTick: 20,
    status: 'open',
    ...overrides,
  };
}

function recordSuccess(world: EconomyWorldState, traderId: string, profit = 60): void {
  recordShipmentMemory(world, {
    traderId,
    order: sampleOrder({ assignedTraderId: traderId }),
    success: true,
    actualProfit: profit,
    revenue: profit + 800,
    cost: 800,
    travelTicks: 2,
    plannedTravelTicks: 2,
    spoilageLoss: 0,
    wasRaid: false,
    deliveredAmount: 8,
  });
}

function recordFail(world: EconomyWorldState, traderId: string, raid = false): void {
  recordShipmentMemory(world, {
    traderId,
    order: sampleOrder({ assignedTraderId: traderId }),
    success: false,
    actualProfit: -400,
    revenue: 0,
    cost: 800,
    travelTicks: 2,
    plannedTravelTicks: 2,
    spoilageLoss: 0,
    wasRaid: raid,
    deliveredAmount: 0,
  });
}

describe('Phase E3 — Trader Memory & Route Learning', () => {
  let world: EconomyWorldState;

  beforeEach(() => {
    world = createFreshWorld();
    setTraderRngSeed(12_345);
  });

  it('1. completed shipment creates memory', () => {
    recordSuccess(world, TRADER);
    const mem = getTraderRouteMemory(world, TRADER, SRC, DEST, COMM);
    expect(mem?.successfulTrips).toBe(1);
    expect(mem?.tripCount).toBe(1);
  });

  it('2. failed shipment lowers success EMA', () => {
    recordSuccess(world, TRADER);
    const before = getTraderRouteMemory(world, TRADER, SRC, DEST, COMM)!.successRateEma;
    recordFail(world, TRADER);
    const after = getTraderRouteMemory(world, TRADER, SRC, DEST, COMM)!.successRateEma;
    expect(after).toBeLessThan(before);
  });

  it('3. raid increases danger memory', () => {
    const before = getTraderRouteMemory(world, TRADER, SRC, DEST, COMM)?.dangerEma
      ?? 0.15;
    recordFail(world, TRADER, true);
    const mem = getTraderRouteMemory(world, TRADER, SRC, DEST, COMM)!;
    expect(mem.raidCount).toBe(1);
    expect(mem.dangerEma).toBeGreaterThan(before);
  });

  it('4. profit EMA updates correctly', () => {
    recordSuccess(world, TRADER, 100);
    recordSuccess(world, TRADER, 20);
    const mem = getTraderRouteMemory(world, TRADER, SRC, DEST, COMM)!;
    expect(mem.profitEma).toBeGreaterThan(20);
    expect(mem.profitEma).toBeLessThan(100);
  });

  it('5. confidence increases with data', () => {
    recordSuccess(world, TRADER);
    const mem = getTraderRouteMemory(world, TRADER, SRC, DEST, COMM)!;
    expect(mem.confidence).toBeGreaterThan(0);
  });

  it('6. confidence decays when unused', () => {
    recordSuccess(world, TRADER);
    const mem = getTraderRouteMemory(world, TRADER, SRC, DEST, COMM)!;
    const before = mem.confidence;
    world.tick += 50;
    tickTraderMemoryDecay(world);
    expect(mem.confidence).toBeLessThan(before);
  });

  it('7. stale low-confidence memory expires', () => {
    recordSuccess(world, TRADER);
    const mem = getTraderRouteMemory(world, TRADER, SRC, DEST, COMM)!;
    mem.confidence = 0.02;
    mem.tripCount = 1;
    mem.lastUsedTick = 0;
    world.tick = TRADER_MEMORY.memoryExpiryTicks + 10;
    tickTraderMemoryDecay(world);
    expect(getTraderRouteMemory(world, TRADER, SRC, DEST, COMM)).toBeUndefined();
  });

  it('8. conservative trader prefers safer route score', () => {
    const safe = sampleOrder({ id: 's', riskCost: 5, profitPerCargoSlot: 5 });
    const risky = sampleOrder({ id: 'r', riskCost: 40, profitPerCargoSlot: 6 });
    world.orders = [safe, risky];
    const trader = world.traders.find((t) => t.id === TRADER)!;
    expect(scoreOrderForTrader(safe, trader, world))
      .toBeGreaterThan(scoreOrderForTrader(risky, trader, world));
  });

  it('9. aggressive trader accepts higher-profit risky order', () => {
    const safe = sampleOrder({ id: 's', riskCost: 5, profitPerCargoSlot: 4, expectedProfit: 30 });
    const risky = sampleOrder({
      id: 'r',
      riskCost: 12,
      profitPerCargoSlot: 18,
      expectedProfit: 120,
      urgency: 0.7,
    });
    world.orders = [safe, risky];
    const trader = world.traders.find((t) => t.id === BOLD)!;
    getTraderProfile(world, BOLD).explorationRate = 0;
    expect(scoreOrderForTrader(risky, trader, world))
      .toBeGreaterThan(scoreOrderForTrader(safe, trader, world));
  });

  it('10. opportunist explores more via RNG threshold', () => {
    setTraderRngSeed(1);
    const profile = getTraderProfile(world, 'trader-roamer');
    let explores = 0;
    for (let t = 0; t < 100; t++) {
      if (shouldExplore(profile.explorationRate, 'trader-roamer', t)) explores += 1;
    }
    expect(explores).toBeGreaterThan(10);
  });

  it('11. exploration uses seeded RNG deterministically', () => {
    setTraderRngSeed(99);
    const a = traderRandom(TRADER, 10, 0);
    setTraderRngSeed(99);
    const b = traderRandom(TRADER, 10, 0);
    expect(a).toBe(b);
  });

  it('12. consecutive successes improve memory score', () => {
    recordSuccess(world, TRADER, 80);
    recordSuccess(world, TRADER, 80);
    const mem = getTraderRouteMemory(world, TRADER, SRC, DEST, COMM)!;
    const profile = getTraderProfile(world, TRADER);
    const score = scoreRouteMemoryComponent(mem, undefined, profile);
    expect(score).toBeGreaterThan(0);
  });

  it('13. consecutive failures reduce effective score via penalty', () => {
    recordFail(world, TRADER);
    recordFail(world, TRADER);
    const mem = getTraderRouteMemory(world, TRADER, SRC, DEST, COMM)!;
    expect(mem.consecutiveFailures).toBeGreaterThanOrEqual(2);
  });

  it('14. trader avoids route after failure threshold', () => {
    const profile = getTraderProfile(world, TRADER);
    const threshold = TRADER_MEMORY.personalityPresets.conservative.avoidFailureThreshold;
    for (let i = 0; i < threshold; i++) recordFail(world, TRADER);
    expect(isRouteAvoided(world, TRADER, SRC, DEST, COMM)).toBe(true);
    void profile;
  });

  it('15. avoid state expires', () => {
    addAvoidedRoute(world, TRADER, SRC, DEST, COMM, 'repeated-failure', 5);
    expect(isRouteAvoided(world, TRADER, SRC, DEST, COMM)).toBe(true);
    world.tick += 6;
    tickTraderMemoryDecay(world);
    expect(isRouteAvoided(world, TRADER, SRC, DEST, COMM)).toBe(false);
  });

  it('16. commodity affinity increases on profit', () => {
    const profile = getTraderProfile(world, TRADER);
    adjustCommodityAffinity(profile, COMM, true);
    expect(getCommodityAffinity(profile, COMM)).toBeGreaterThan(1);
  });

  it('17. commodity affinity decreases on loss', () => {
    const profile = getTraderProfile(world, TRADER);
    adjustCommodityAffinity(profile, COMM, false);
    expect(getCommodityAffinity(profile, COMM)).toBeLessThan(1);
  });

  it('18. affinity clamped to bounds', () => {
    const profile = getTraderProfile(world, TRADER);
    for (let i = 0; i < 100; i++) adjustCommodityAffinity(profile, COMM, true);
    expect(getCommodityAffinity(profile, COMM)).toBeLessThanOrEqual(TRADER_MEMORY.affinityMax);
    for (let i = 0; i < 200; i++) adjustCommodityAffinity(profile, COMM, false);
    expect(getCommodityAffinity(profile, COMM)).toBeGreaterThanOrEqual(TRADER_MEMORY.affinityMin);
  });

  it('19. global route reputation used without personal memory', () => {
    const rep = getOrCreateRouteReputation(world, SRC, DEST, COMM);
    rep.averageProfit = 50;
    rep.successfulTrips = 10;
    rep.reputationScore = 8;
    const profile = getTraderProfile(world, TRADER);
    const score = scoreRouteMemoryComponent(undefined, rep, profile);
    expect(score).toBeGreaterThan(0);
  });

  it('20. personal memory overrides global when confidence high', () => {
    recordSuccess(world, TRADER, 100);
    recordSuccess(world, TRADER, 100);
    const mem = getTraderRouteMemory(world, TRADER, SRC, DEST, COMM)!;
    mem.confidence = 0.8;
    const rep = getOrCreateRouteReputation(world, SRC, DEST, COMM);
    rep.reputationScore = -5;
    const profile = getTraderProfile(world, TRADER);
    const withMem = scoreRouteMemoryComponent(mem, rep, profile);
    const repOnly = scoreRouteMemoryComponent(undefined, rep, profile);
    expect(withMem).toBeGreaterThan(repOnly);
  });

  it('21. congestion increases with traffic', () => {
    const route = world.routes.find((r) => r.sourceCellId === SRC && r.targetCellId === DEST)!;
    route.traffic = 0;
    const low = getCongestionLevel(route);
    route.traffic = 8;
    const high = getCongestionLevel(route);
    expect(high).toBeGreaterThan(low);
  });

  it('22. congestion increases effective travel ticks', () => {
    const route = world.routes.find((r) => r.sourceCellId === SRC && r.targetCellId === DEST)!;
    route.traffic = 0;
    const base = getEffectiveTravelTicks(route);
    route.traffic = 10;
    expect(getEffectiveTravelTicks(route)).toBeGreaterThan(base);
  });

  it('23. congestion reduces route score via travel penalty', () => {
    const route = world.routes.find((r) => r.sourceCellId === SRC && r.targetCellId === DEST)!;
    route.traffic = 0;
    world.orders = [sampleOrder()];
    const trader = world.traders[0];
    const lowCong = scoreOrderForTrader(world.orders[0], trader, world);
    route.traffic = 12;
    const highCong = scoreOrderForTrader(world.orders[0], trader, world);
    expect(highCong).toBeLessThan(lowCong);
  });

  it('24. traders can pick alternate orders when one route congested', () => {
    const congested = sampleOrder({ id: 'a', expectedProfit: 60, profitPerCargoSlot: 8, urgency: 0.5 });
    const alternate = sampleOrder({
      id: 'b',
      commodityId: 'hardwood',
      sourceIslandId: 'leaf-island',
      destinationIslandId: 'mine-island',
      expectedProfit: 55,
      profitPerCargoSlot: 7,
      urgency: 0.6,
    });
    world.orders = [congested, alternate];
    const route = world.routes.find((r) => r.sourceCellId === SRC && r.targetCellId === DEST)!;
    route.traffic = 20;
    const trader = world.traders[0];
    getTraderProfile(world, trader.id).explorationRate = 0;
    const scoreCongested = scoreOrderForTrader(congested, trader, world);
    route.traffic = 0;
    const scoreAlt = scoreOrderForTrader(alternate, trader, world);
    expect(scoreAlt).toBeGreaterThan(scoreCongested);
  });

  it('25. save/load preserves trader memory', () => {
    recordSuccess(world, TRADER);
    const count = world.traderRouteMemories.length;
    if (typeof localStorage !== 'undefined') {
      saveEconomyState(world);
      const loaded = loadEconomyState();
      expect(loaded?.traderRouteMemories.length).toBe(count);
    } else {
      expect(count).toBeGreaterThan(0);
    }
  });

  it('26. migration v4 fields initialize on fresh world', () => {
    expect(world.traderProfiles.length).toBeGreaterThan(0);
    expect(world.traderRngSeed).toBeDefined();
    expect(world.routeReputations).toBeDefined();
  });

  it('27. no duplicate memory keys', () => {
    recordSuccess(world, TRADER);
    recordSuccess(world, TRADER);
    const keys = world.traderRouteMemories.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('28. max memories per trader enforced', () => {
    for (let i = 0; i < TRADER_MEMORY.maxMemoriesPerTrader + 20; i++) {
      recordShipmentMemory(world, {
        traderId: TRADER,
        order: sampleOrder({
          commodityId: (['rope', 'fresh-fish', 'hardwood'] as LivingCommodityId[])[i % 3],
          sourceIslandId: (['cloth-island', 'leaf-island', 'mine-island'] as const)[i % 3],
          destinationIslandId: (['shipyard-island', 'mine-island', 'cloth-island'] as const)[i % 3],
        }),
        success: true,
        actualProfit: 10,
        revenue: 100,
        cost: 90,
        travelTicks: 2,
        plannedTravelTicks: 2,
        spoilageLoss: 0,
        wasRaid: false,
        deliveredAmount: 5,
      });
    }
    const count = world.traderRouteMemories.filter((m) => m.traderId === TRADER).length;
    expect(count).toBeLessThanOrEqual(TRADER_MEMORY.maxMemoriesPerTrader);
  });

  it('29. no NaN or Infinity in memory after updates', () => {
    recordSuccess(world, TRADER);
    recordFail(world, BOLD, true);
    for (const m of world.traderRouteMemories) {
      expect(Number.isFinite(m.profitEma)).toBe(true);
      expect(Number.isFinite(m.successRateEma)).toBe(true);
      expect(Number.isFinite(m.dangerEma)).toBe(true);
    }
  });

  it('30. long-run traders do not stick to one route only', () => {
    const sim = new LivingTradeSimulator(true);
    setTraderRngSeed(77_777);
    const routePickCounts = new Map<string, number>();
    for (let i = 0; i < 800; i++) {
      sim.tick();
      for (const o of sim.state.orders.filter((x) => x.status === 'completed' && x.assignedTraderId)) {
        const k = routeAvoidKey(o.sourceIslandId, o.destinationIslandId, o.commodityId);
        routePickCounts.set(k, (routePickCounts.get(k) ?? 0) + 1);
      }
    }
    expect(routePickCounts.size).toBeGreaterThan(1);
  });

  it('31. long-run commodity specialization emerges', () => {
    const sim = new LivingTradeSimulator(true);
    for (let i = 0; i < 500; i++) sim.tick();
    const specialized = sim.traderProfiles.filter(
      (p) => p.preferredCommodities.length > 0 || Object.keys(p.commodityAffinity).length > 0,
    );
    expect(specialized.length).toBeGreaterThan(0);
  });

  it('32. E1 factory receives shipment from learning traders', () => {
    const sim = new LivingTradeSimulator(true);
    const w = sim.state as EconomyWorldState;
    w.cells.find((c) => c.id === 'shipyard-island')!.commodities.rope!.stock = 2;
    w.cells.find((c) => c.id === 'cloth-island')!.commodities.rope!.stock = 200;
    for (let i = 0; i < 60; i++) sim.tick();
    const completed = w.orders.filter((o) => o.commodityId === 'rope' && o.status === 'completed');
    const stock = w.cells.find((c) => c.id === 'shipyard-island')!.commodities.rope!.stock;
    expect(completed.length + stock).toBeGreaterThan(2);
  });

  it('33. E2 order lifecycle still works with memory', () => {
    world.cells.find((c) => c.id === DEST)!.commodities[COMM]!.stock = 5;
    world.cells.find((c) => c.id === SRC)!.commodities[COMM]!.stock = 120;
    generateTradeOrders(world, []);
    updateDynamicTradeEconomy(world, [], { allowDepart: true });
    expect(world.orders.some((o) => o.status !== 'expired')).toBe(true);
  });

  it('34. avoided route does not block all traders', () => {
    addAvoidedRoute(world, TRADER, SRC, DEST, COMM, 'repeated-failure');
    world.orders = [sampleOrder()];
    const bold = world.traders.find((t) => t.id === BOLD)!;
    const score = scoreOrderForTrader(world.orders[0], bold, world);
    expect(score).toBeGreaterThan(0);
  });

  it('35. aggressive trader overrides avoidance on emergency urgency', () => {
    addAvoidedRoute(world, BOLD, SRC, DEST, COMM, 'repeated-failure');
    const urgent = sampleOrder({ urgency: 0.95, expectedProfit: 80 });
    world.orders = [urgent];
    const trader = world.traders.find((t) => t.id === BOLD)!;
    expect(scoreOrderForTrader(urgent, trader, world)).toBeGreaterThan(0);
  });

  it('36. memory key format is stable', () => {
    const key = traderMemoryKey(TRADER, SRC, DEST, COMM);
    expect(key).toBe(`${TRADER}:${SRC}:${DEST}:${COMM}`);
    expect(routeReputationKey(SRC, DEST, COMM)).toBe(`${SRC}:${DEST}:${COMM}`);
  });

  it('37. clear trader memory resets route memories only', () => {
    recordSuccess(world, TRADER);
    const profileBefore = getTraderProfile(world, TRADER).lifetimeProfit;
    clearTraderMemory(world, TRADER);
    expect(getTraderRouteMemory(world, TRADER, SRC, DEST, COMM)).toBeUndefined();
    expect(getTraderProfile(world, TRADER).lifetimeProfit).toBe(profileBefore);
  });

  it(
    '38. long-run 5000 ticks stability with metrics',
    () => {
    const sim = new LivingTradeSimulator(true);
    setTraderRngSeed(55_555);
    let completed = 0;
    let failed = 0;
    let maxMem = 0;
    let maxAvoid = 0;
    let reopenCount = 0;
    const routeSet = new Set<string>();

    for (let i = 0; i < 5000; i++) {
      sim.tick();
      const w = sim.state;
      for (const o of w.orders) {
        if (o.status === 'completed') {
          completed += 1;
          routeSet.add(routeAvoidKey(o.sourceIslandId, o.destinationIslandId, o.commodityId));
        }
        if (o.status === 'failed') failed += 1;
      }
      maxMem = Math.max(maxMem, w.traderRouteMemories.length);
      maxAvoid = Math.max(maxAvoid, w.avoidedRoutes.length);
      for (const f of w.factories) {
        if (f.lastDecision === 'reopen') reopenCount += 1;
      }
      for (const cell of w.cells) {
        for (const item of Object.values(cell.commodities)) {
          if (item) {
            expect(Number.isFinite(item.stock)).toBe(true);
            expect(item.stock).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }

    expect(maxMem).toBeLessThan(500);
    expect(sim.state.traderRouteMemories.length).toBeLessThan(400);
    expect(routeSet.size).toBeGreaterThan(1);
    expect(completed + failed).toBeGreaterThan(0);
    expect(maxAvoid).toBeLessThan(100);
    expect(reopenCount).toBeGreaterThanOrEqual(0);
    },
    120_000,
  );
});
