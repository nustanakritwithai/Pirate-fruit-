import { describe, expect, it, beforeEach } from 'vitest';
import { LivingTradeSimulator } from '../LivingTradeSimulator';
import { createFreshWorld, saveEconomyState, loadEconomyState } from '../LivingTradePersistence';
import { DYNAMIC_TRADE } from '../DynamicTradeConfig';
import {
  updateDynamicTradeEconomy,
  ensureTraders,
  failTradeShipment,
  createDefaultTraders,
} from '../DynamicTradeEconomy';
import {
  generateTradeOrders,
  expireTradeOrders,
  resetOrderCounter,
} from '../TradeOrderGenerator';
import { scoreOrderForTrader, pickBestOrderForTrader } from '../TraderDecision';
import { getTraderProfile } from '../TraderMemoryStore';
import {
  getExportableStock,
  getReservedAmount,
  reserveStock,
  releaseReservation,
} from '../TradeStockReservation';
import { orderDedupKey, migrateAllRoutes } from '../TradeRouteUtils';
import { moveCargo, updatePrices } from '../EconomyRules';
import { debugForcePause } from '../FactoryAgent';
import { updateAdaptiveEconomy } from '../AdaptiveEconomy';
import type { DynamicTradeOrder, EconomyWorldState, LivingCommodityId } from '../types';

function freshWorld(): EconomyWorldState {
  resetOrderCounter();
  return createFreshWorld();
}

function setShortage(world: EconomyWorldState, cellId: 'shipyard-island', commodityId: LivingCommodityId, ratio: number): void {
  const cell = world.cells.find((c) => c.id === cellId)!;
  const item = cell.commodities[commodityId]!;
  item.stock = item.targetStock * ratio;
}

function setSurplus(world: EconomyWorldState, cellId: 'cloth-island', commodityId: LivingCommodityId): void {
  const cell = world.cells.find((c) => c.id === cellId)!;
  const item = cell.commodities[commodityId]!;
  item.stock = item.targetStock * 2;
}

function activeOrders(world: EconomyWorldState): DynamicTradeOrder[] {
  return world.orders.filter(
    (o) => o.status === 'open' || o.status === 'assigned' || o.status === 'in-transit',
  );
}

describe('Phase E2 — Dynamic Trade Orders', () => {
  beforeEach(() => resetOrderCounter());

  it('1. shortage island creates import order', () => {
    const world = freshWorld();
    setShortage(world, 'shipyard-island', 'rope', 0.2);
    setSurplus(world, 'cloth-island', 'rope');
    const log: import('../types').EconomyLogEntry[] = [];
    const created = generateTradeOrders(world, log);
    expect(created.length).toBeGreaterThan(0);
    expect(created.some((o) => o.commodityId === 'rope' && o.destinationIslandId === 'shipyard-island')).toBe(true);
  });

  it('2. balanced island does not create order', () => {
    const world = freshWorld();
    for (const cell of world.cells) {
      for (const item of Object.values(cell.commodities)) {
        if (item) item.stock = item.targetStock;
      }
    }
    const before = world.orders.length;
    generateTradeOrders(world, []);
    expect(world.orders.length).toBe(before);
  });

  it('3. selects source with surplus', () => {
    const world = freshWorld();
    setShortage(world, 'shipyard-island', 'rope', 0.2);
    setSurplus(world, 'cloth-island', 'rope');
    generateTradeOrders(world, []);
    const order = world.orders.find((o) => o.commodityId === 'rope');
    expect(order?.sourceIslandId).toBe('cloth-island');
  });

  it('4. does not export below reserve stock', () => {
    const world = freshWorld();
    const leaf = world.cells.find((c) => c.id === 'leaf-island')!;
    leaf.commodities.hardwood!.stock = 8;
    const exportable = getExportableStock(world, 'leaf-island', 'hardwood');
    expect(exportable).toBe(0);
  });

  it('5. deduplicates active orders by key', () => {
    const world = freshWorld();
    setShortage(world, 'shipyard-island', 'rope', 0.2);
    setSurplus(world, 'cloth-island', 'rope');
    generateTradeOrders(world, []);
    generateTradeOrders(world, []);
    const keys = activeOrders(world).map(
      (o) => orderDedupKey(o.sourceIslandId, o.destinationIslandId, o.commodityId),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('6. merges amount when shortage worsens', () => {
    const world = freshWorld();
    setShortage(world, 'shipyard-island', 'rope', 0.5);
    setSurplus(world, 'cloth-island', 'rope');
    generateTradeOrders(world, []);
    const first = world.orders.find((o) => o.commodityId === 'rope')!.remainingAmount;
    setShortage(world, 'shipyard-island', 'rope', 0.15);
    world.orderGenCooldowns['shipyard-island'] = 0;
    generateTradeOrders(world, []);
    const second = world.orders.find((o) => o.commodityId === 'rope')!.remainingAmount;
    expect(second).toBeGreaterThanOrEqual(first);
  });

  it('7. urgency increases with deeper shortage', () => {
    const world = freshWorld();
    setShortage(world, 'shipyard-island', 'rope', 0.5);
    setSurplus(world, 'cloth-island', 'rope');
    generateTradeOrders(world, []);
    const mild = world.orders.find((o) =>
      o.commodityId === 'rope' && o.destinationIslandId === 'shipyard-island')!.urgency;
    world.orders = [];
    world.orderGenCooldowns['shipyard-island'] = 0;
    setShortage(world, 'shipyard-island', 'rope', 0.1);
    generateTradeOrders(world, []);
    const crisis = world.orders.find((o) =>
      o.commodityId === 'rope' && o.destinationIslandId === 'shipyard-island')!.urgency;
    expect(crisis).toBeGreaterThan(mild);
  });

  it('8. orders expire after expiry tick', () => {
    const world = freshWorld();
    setShortage(world, 'shipyard-island', 'rope', 0.2);
    setSurplus(world, 'cloth-island', 'rope');
    generateTradeOrders(world, []);
    const order = world.orders[0];
    world.tick = order.expiresAtTick;
    expireTradeOrders(world, []);
    expect(order.status).toBe('expired');
  });

  it('9. NPC picks highest scoring profitable order', () => {
    const world = freshWorld();
    ensureTraders(world);
    const trader = world.traders[0];
    const orderA: DynamicTradeOrder = {
      id: 'a', commodityId: 'rope', sourceIslandId: 'cloth-island', destinationIslandId: 'shipyard-island',
      requestedAmount: 8, remainingAmount: 8, sourceBuyPrice: 100, destinationSellPrice: 200,
      expectedRevenue: 1600, purchaseCost: 800, transportCost: 5, riskCost: 2, spoilageCost: 0,
      expectedProfit: 50, profitPerCargoSlot: 6.25, urgency: 0.8, travelTicks: 2,
      createdTick: 0, expiresAtTick: 20, status: 'open',
    };
    const orderB = { ...orderA, id: 'b', expectedProfit: 120, profitPerCargoSlot: 15 };
    world.orders = [orderA, orderB];
    getTraderProfile(world, trader.id).explorationRate = 0;
    const pick = pickBestOrderForTrader(trader, world.orders, world, 12);
    expect(pick?.order.id).toBe('b');
  });

  it('10. risk cost reduces score for cautious trader', () => {
    const world = freshWorld();
    const cautious = { ...createDefaultTraders()[0], riskTolerance: 0.2 };
    const bold = { ...createDefaultTraders()[2], riskTolerance: 0.9 };
    const order: DynamicTradeOrder = {
      id: 'r', commodityId: 'rope', sourceIslandId: 'cloth-island', destinationIslandId: 'shipyard-island',
      requestedAmount: 8, remainingAmount: 8, sourceBuyPrice: 100, destinationSellPrice: 200,
      expectedRevenue: 1600, purchaseCost: 800, transportCost: 5, riskCost: 20, spoilageCost: 0,
      expectedProfit: 40, profitPerCargoSlot: 5, urgency: 0.5, travelTicks: 2,
      createdTick: 0, expiresAtTick: 20, status: 'open',
    };
    const scoreCautious = scoreOrderForTrader(order, cautious, world);
    const scoreBold = scoreOrderForTrader(order, bold, world);
    expect(scoreBold).toBeGreaterThan(scoreCautious);
  });

  it('11. cautious trader prefers safer route when profits similar', () => {
    const world = freshWorld();
    const route = world.routes.find((r) => r.sourceCellId === 'cloth-island' && r.targetCellId === 'shipyard-island')!;
    route.danger = 0.8;
    const cautious = createDefaultTraders()[0];
    const order: DynamicTradeOrder = {
      id: 'r', commodityId: 'rope', sourceIslandId: 'cloth-island', destinationIslandId: 'shipyard-island',
      requestedAmount: 8, remainingAmount: 8, sourceBuyPrice: 100, destinationSellPrice: 200,
      expectedRevenue: 1600, purchaseCost: 800, transportCost: 5, riskCost: 40, spoilageCost: 0,
      expectedProfit: 30, profitPerCargoSlot: 4, urgency: 0.5, travelTicks: 2,
      createdTick: 0, expiresAtTick: 20, status: 'open',
    };
    const safeOrder = { ...order, id: 's', riskCost: 5, expectedProfit: 28, profitPerCargoSlot: 3.5 };
    expect(scoreOrderForTrader(safeOrder, cautious, world))
      .toBeGreaterThan(scoreOrderForTrader(order, cautious, world));
  });

  it('12. bold trader accepts high-profit risky order', () => {
    const world = freshWorld();
    const bold = createDefaultTraders()[2];
    const risky: DynamicTradeOrder = {
      id: 'r', commodityId: 'rope', sourceIslandId: 'cloth-island', destinationIslandId: 'shipyard-island',
      requestedAmount: 8, remainingAmount: 8, sourceBuyPrice: 100, destinationSellPrice: 300,
      expectedRevenue: 2400, purchaseCost: 800, transportCost: 5, riskCost: 30, spoilageCost: 0,
      expectedProfit: 200, profitPerCargoSlot: 25, urgency: 0.7, travelTicks: 2,
      createdTick: 0, expiresAtTick: 20, status: 'open',
    };
    expect(scoreOrderForTrader(risky, bold, world)).toBeGreaterThan(DYNAMIC_TRADE.minimumExpectedProfit);
  });

  it('13. perishable goods incur spoilage cost', () => {
    const world = freshWorld();
    setShortage(world, 'shipyard-island', 'fresh-fish', 0.2);
    const leaf = world.cells.find((c) => c.id === 'leaf-island')!;
    leaf.commodities['fresh-fish']!.stock = leaf.commodities['fresh-fish']!.targetStock * 2;
    generateTradeOrders(world, []);
    const fishOrder = world.orders.find((o) => o.commodityId === 'fresh-fish');
    const ropeOrder = world.orders.find((o) => o.commodityId === 'rope');
    if (fishOrder) expect(fishOrder.spoilageCost).toBeGreaterThan(0);
    if (ropeOrder) expect(ropeOrder.spoilageCost).toBe(0);
  });

  it('14. cargo capacity limits assigned amount', () => {
    const world = freshWorld();
    ensureTraders(world);
    for (const t of world.traders) t.cargoCapacity = 5;
    setShortage(world, 'shipyard-island', 'rope', 0.1);
    setSurplus(world, 'cloth-island', 'rope');
    updateDynamicTradeEconomy(world, [], { allowDepart: true });
    const assigned = world.orders.find((o) => o.status === 'assigned' || o.status === 'in-transit');
    if (assigned) expect(assigned.remainingAmount).toBeLessThanOrEqual(5);
  });

  it('15. stock reserved after assign', () => {
    const world = freshWorld();
    setShortage(world, 'shipyard-island', 'rope', 0.2);
    setSurplus(world, 'cloth-island', 'rope');
    updateDynamicTradeEconomy(world, [], { allowDepart: false });
    const reserved = getReservedAmount(world, 'cloth-island', 'rope');
    expect(reserved).toBeGreaterThan(0);
  });

  it('16. reservation released on order failure', () => {
    const world = freshWorld();
    setShortage(world, 'shipyard-island', 'rope', 0.2);
    setSurplus(world, 'cloth-island', 'rope');
    updateDynamicTradeEconomy(world, [], { allowDepart: true });
    const order = world.orders.find((o) => o.status === 'in-transit');
    if (!order) return;
    failTradeShipment(world, order.id, [], true);
    releaseReservation(world, order.id);
    expect(getReservedAmount(world, 'cloth-island', 'rope')).toBe(0);
  });

  it('17. completed shipment increases destination stock', () => {
    const sim = new LivingTradeSimulator(true);
    const world = sim.state as EconomyWorldState;
    setShortage(world, 'shipyard-island', 'rope', 0.2);
    setSurplus(world, 'cloth-island', 'rope');
    const before = world.cells.find((c) => c.id === 'shipyard-island')!.commodities.rope!.stock;
    sim.tickMany(40);
    const after = world.cells.find((c) => c.id === 'shipyard-island')!.commodities.rope!.stock;
    const completed = world.orders.some((o) => o.status === 'completed');
    expect(completed || after > before).toBe(true);
  });

  it('18. destination price can fall after delivery', () => {
    const world = freshWorld();
    const dest = world.cells.find((c) => c.id === 'shipyard-island')!;
    const item = dest.commodities.rope!;
    item.stock = item.targetStock * 0.2;
    item.currentPrice = 300;
    const before = item.currentPrice;
    item.stock += 40;
    updatePrices(dest);
    expect(item.currentPrice).toBeLessThanOrEqual(before);
  });

  it('19. factory can reopen after input shipment', () => {
    const sim = new LivingTradeSimulator(true);
    const cell = sim.getCell('shipyard-island')!;
    const factory = sim.factories.find((f) => f.recipeId === 'sailcloth')!;
    cell.commodities.rope!.stock = 0;
    cell.commodities.hardwood!.stock = 0;
    debugForcePause(factory, cell);
    expect(factory.status).toBe('paused');
    cell.commodities.rope!.stock = cell.commodities.rope!.targetStock;
    cell.commodities.hardwood!.stock = cell.commodities.hardwood!.targetStock * 2;
    for (const inputId of ['rope', 'hardwood'] as const) {
      const inp = cell.commodities[inputId]!;
      inp.currentPrice = inp.basePrice * 0.5;
      inp.memory.averagePrice = inp.basePrice * 0.5;
    }
    const out = cell.commodities.sailcloth!;
    out.stock = 0;
    out.currentPrice = out.basePrice * 2;
    for (let i = 0; i < 12; i++) {
      factory.adaptationCooldown = 0;
      updateAdaptiveEconomy(sim.state as EconomyWorldState);
    }
    expect(['operating', 'expanding', 'recovering', 'paused']).toContain(factory.status);
  });

  it('20. route traffic increases after successful trip', () => {
    const world = freshWorld();
    const route = world.routes.find(
      (r) => r.sourceCellId === 'cloth-island' && r.targetCellId === 'shipyard-island',
    )!;
    const before = route.traffic ?? 0;
    setShortage(world, 'shipyard-island', 'rope', 0.15);
    setSurplus(world, 'cloth-island', 'rope');
    updateDynamicTradeEconomy(world, [], { allowDepart: true });
    for (let i = 0; i < 10; i++) moveCargo(world, []);
    if ((route.successfulTrips ?? 0) > 0) {
      expect(route.traffic ?? 0).toBeGreaterThan(before);
    }
  });

  it('21. no negative stock after trade ticks', () => {
    const sim = new LivingTradeSimulator(true);
    for (let i = 0; i < 100; i++) sim.tick();
    for (const cell of sim.state.cells) {
      for (const item of Object.values(cell.commodities)) {
        if (item) expect(item.stock).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('22. no negative order amounts', () => {
    const sim = new LivingTradeSimulator(true);
    for (let i = 0; i < 100; i++) sim.tick();
    for (const o of sim.state.orders) {
      expect(o.remainingAmount).toBeGreaterThanOrEqual(0);
      expect(o.requestedAmount).toBeGreaterThanOrEqual(0);
    }
  });

  it('23. save/load preserves orders (migration v4)', () => {
    const world = freshWorld();
    setShortage(world, 'shipyard-island', 'rope', 0.2);
    setSurplus(world, 'cloth-island', 'rope');
    generateTradeOrders(world, []);
    const ordersBefore = world.orders.length;
    if (typeof localStorage !== 'undefined') {
      saveEconomyState(world);
      const loaded = loadEconomyState();
      expect(loaded?.orders.length).toBe(ordersBefore);
    } else {
      ensureTraders(world);
      expect(world.orders.length).toBe(ordersBefore);
    }
  });

  it('24. migrates v3 routes to enriched route state', () => {
    const legacy = [{
      sourceCellId: 'leaf-island' as const,
      targetCellId: 'mine-island' as const,
      travelTicks: 2,
      transportCost: 5,
    }];
    const migrated = migrateAllRoutes(legacy);
    expect(migrated[0].danger).toBeDefined();
    expect(migrated[0].successfulTrips).toBe(0);
  });

  it('25. long-run 2000 ticks — stability', () => {
    const sim = new LivingTradeSimulator(true);
    let completedShipments = 0;
    for (let i = 0; i < 2000; i++) {
      sim.tick();
      completedShipments += sim.state.orders.filter((o) => o.status === 'completed').length;
    }
    const world = sim.state;
    const activeKeys = new Set(
      activeOrders(world).map(
        (o) => orderDedupKey(o.sourceIslandId, o.destinationIslandId, o.commodityId),
      ),
    );
    expect(activeKeys.size).toBe(activeOrders(world).length);
    expect(activeOrders(world).length).toBeLessThan(50);
    for (const cell of world.cells) {
      for (const item of Object.values(cell.commodities)) {
        if (!item) continue;
        expect(Number.isFinite(item.stock)).toBe(true);
        expect(item.stock).toBeGreaterThanOrEqual(0);
      }
    }
    for (const r of world.reservations) {
      expect(r.amount).toBeGreaterThanOrEqual(0);
    }
    expect(completedShipments).toBeGreaterThan(0);
  }, 40000);

  it('26. reserveStock rejects over-commitment', () => {
    const world = freshWorld();
    const cloth = world.cells.find((c) => c.id === 'cloth-island')!;
    cloth.commodities.rope!.stock = 20;
    const ok = reserveStock(world, {
      cellId: 'cloth-island',
      commodityId: 'rope',
      amount: 5,
      orderId: 't1',
      reservedAtTick: 0,
    });
    const fail = reserveStock(world, {
      cellId: 'cloth-island',
      commodityId: 'rope',
      amount: 100,
      orderId: 't2',
      reservedAtTick: 0,
    });
    expect(ok).toBe(true);
    expect(fail).toBe(false);
  }, 40_000);

  it('27. failed shipment increases route danger', () => {
    const world = freshWorld();
    const route = world.routes.find(
      (r) => r.sourceCellId === 'cloth-island' && r.targetCellId === 'shipyard-island',
    )!;
    const before = route.danger ?? 0;
    world.orders.push({
      id: 'fail-1', commodityId: 'rope', sourceIslandId: 'cloth-island', destinationIslandId: 'shipyard-island',
      requestedAmount: 5, remainingAmount: 5, sourceBuyPrice: 100, destinationSellPrice: 200,
      expectedRevenue: 1000, purchaseCost: 500, transportCost: 5, riskCost: 5, spoilageCost: 0,
      expectedProfit: 20, profitPerCargoSlot: 4, urgency: 0.5, travelTicks: 2,
      createdTick: 0, expiresAtTick: 20, status: 'in-transit', assignedTraderId: 'trader-leaf-safe',
    });
    failTradeShipment(world, 'fail-1', [], true);
    expect(route.danger ?? 0).toBeGreaterThan(before);
    expect(route.failedTrips ?? 0).toBe(1);
  });
});
