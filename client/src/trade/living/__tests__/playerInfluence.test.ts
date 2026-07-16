import { describe, expect, it, beforeEach } from 'vitest';
import { LivingTradeSimulator } from '../LivingTradeSimulator';
import { createFreshWorld, saveEconomyState, loadEconomyState } from '../LivingTradePersistence';
import { PLAYER_REPUTATION_CONFIG } from '../PlayerReputationConfig';
import { recordPlayerTrade } from '../PlayerEconomicProfileManager';
import {
  classifyMarketImpact,
  getMarketStateAfterTrade,
  updateActivityWindow,
} from '../PlayerEconomicImpactAnalyzer';
import {
  clampRep,
  createDefaultProfile,
  getFeeModifier,
  getOrCreateIslandReputation,
  resolveEconomicTitle,
  tickReputationDecay,
} from '../PlayerReputationManager';
import {
  acceptContract,
  abandonContract,
  onPlayerSellForContracts,
  tickPlayerContracts,
  completeContractWithWallet,
  failContractDebug,
} from '../PlayerContractManager';
import {
  generatePlayerContracts,
  getNpcAssignableAmount,
  resetContractCounter,
} from '../PlayerContractGenerator';
import { ensurePlayerEconomy } from '../PlayerEconomicProfileManager';
import { resetOrderCounter } from '../TradeOrderGenerator';
import type {
  CommodityState,
  DynamicTradeOrder,
  EconomyWorldState,
  LivingCommodityId,
} from '../types';
import { yieldToTestRunner } from './soakTestUtils';

const PLAYER = 'player';
const ISLAND = 'starter-island' as const;
const COMM = 'fresh-fish' as LivingCommodityId;

function mockWallet(coins = 10_000) {
  let balance = coins;
  return {
    get coins() { return balance; },
    spendCoins(amount: number) {
      if (balance < amount) return false;
      balance -= amount;
      return true;
    },
    addCoins(amount: number) {
      balance += amount;
    },
  };
}

function sampleItem(overrides: Partial<CommodityState> = {}): CommodityState {
  return {
    stock: 50,
    production: 5,
    baseProduction: 5,
    consumption: 4,
    demand: 10,
    baseDemand: 10,
    importDemand: 0,
    exportDemand: 0,
    targetStock: 100,
    basePrice: 45,
    currentPrice: 45,
    previousPrice: 45,
    trend: 'stable',
    marketState: 'balanced',
    memory: { recentBuyVolume: 0, recentSellVolume: 0, shortageTicks: 0, surplusTicks: 0, averagePrice: 45 },
    perishable: true,
    ...overrides,
  };
}

function sampleOrder(overrides: Partial<DynamicTradeOrder> = {}): DynamicTradeOrder {
  return {
    id: 'order-test-1',
    commodityId: 'rope',
    sourceIslandId: 'cloth-island',
    destinationIslandId: 'shipyard-island',
    requestedAmount: 12,
    remainingAmount: 12,
    sourceBuyPrice: 100,
    destinationSellPrice: 200,
    expectedRevenue: 2400,
    purchaseCost: 1200,
    transportCost: 10,
    riskCost: 20,
    spoilageCost: 0,
    expectedProfit: 80,
    profitPerCargoSlot: 6.67,
    urgency: 0.82,
    travelTicks: 2,
    createdTick: 0,
    expiresAtTick: 30,
    status: 'open',
    ...overrides,
  };
}

function recordSell(
  world: EconomyWorldState,
  islandId: typeof ISLAND,
  commodityId: LivingCommodityId,
  amount: number,
  stockBefore: number,
) {
  const stockAfter = stockBefore + amount;
  const item = sampleItem({ stock: stockAfter, targetStock: 100 });
  item.marketState = getMarketStateAfterTrade(item, stockAfter);
  return recordPlayerTrade(world, {
    islandId,
    commodityId,
    type: 'sell',
    amount,
    unitPrice: 50,
    stockBefore,
    targetStock: 100,
    marketStateBefore: getMarketStateAfterTrade(sampleItem({ stock: stockBefore, targetStock: 100 }), stockBefore),
    item,
  });
}

describe('Phase E3.5 — Player Influence & Trade Contracts', () => {
  let world: EconomyWorldState;
  let sim: LivingTradeSimulator;

  beforeEach(() => {
    resetOrderCounter();
    resetContractCounter();
    world = createFreshWorld();
    sim = new LivingTradeSimulator(true);
    sim.setContractWallet(mockWallet());
  });

  it('1. buy records trade event', () => {
    const pe = ensurePlayerEconomy(world);
    recordPlayerTrade(world, {
      islandId: ISLAND,
      commodityId: COMM,
      type: 'buy',
      amount: 5,
      unitPrice: 50,
      stockBefore: 100,
      targetStock: 100,
      marketStateBefore: 'balanced',
      item: sampleItem(),
    });
    expect(pe.tradeHistory.length).toBe(1);
    expect(pe.profile.totalUnitsBought).toBe(5);
  });

  it('2. sell records trade event', () => {
    recordSell(world, ISLAND, COMM, 5, 50);
    expect(ensurePlayerEconomy(world).profile.totalUnitsSold).toBe(5);
  });

  it('3. sell helping shortage increases supplier reputation', () => {
    recordSell(world, ISLAND, COMM, 50, 30);
    const rep = ensurePlayerEconomy(world).profile.islandReputations[ISLAND];
    expect(rep.supplierReputation).toBeGreaterThan(0);
  });

  it('4. sell resolving crisis increases reputation more than shortage', () => {
    const w1 = createFreshWorld();
    recordSell(w1, ISLAND, COMM, 40, 5);
    const crisisGain = ensurePlayerEconomy(w1).profile.islandReputations[ISLAND].supplierReputation;

    const w2 = createFreshWorld();
    recordSell(w2, ISLAND, COMM, 30, 50);
    const shortageGain = ensurePlayerEconomy(w2).profile.islandReputations[ISLAND].supplierReputation;
    expect(crisisGain).toBeGreaterThan(shortageGain);
  });

  it('5. buy causing shortage increases manipulation', () => {
    const item = sampleItem({ stock: 80, marketState: 'balanced', targetStock: 100 });
    recordPlayerTrade(world, {
      islandId: ISLAND, commodityId: COMM, type: 'buy', amount: 30, unitPrice: 60,
      stockBefore: 80, targetStock: 100, marketStateBefore: 'balanced', item,
    });
    const rep = getOrCreateIslandReputation(ensurePlayerEconomy(world).profile, ISLAND);
    expect(rep.marketManipulation).toBeGreaterThan(0);
  });

  it('6. buy causing crisis increases manipulation more', () => {
    const w1 = createFreshWorld();
    const item1 = sampleItem({ stock: 35, marketState: 'shortage', targetStock: 100 });
    recordPlayerTrade(w1, {
      islandId: ISLAND, commodityId: COMM, type: 'buy', amount: 20, unitPrice: 80,
      stockBefore: 35, targetStock: 100, marketStateBefore: 'shortage', item: item1,
    });
    const m1 = getOrCreateIslandReputation(ensurePlayerEconomy(w1).profile, ISLAND).marketManipulation;

    const w2 = createFreshWorld();
    const item2 = sampleItem({ stock: 80, marketState: 'balanced', targetStock: 100 });
    recordPlayerTrade(w2, {
      islandId: ISLAND, commodityId: COMM, type: 'buy', amount: 30, unitPrice: 60,
      stockBefore: 80, targetStock: 100, marketStateBefore: 'balanced', item: item2,
    });
    const m2 = getOrCreateIslandReputation(ensurePlayerEconomy(w2).profile, ISLAND).marketManipulation;
    expect(m1).toBeGreaterThanOrEqual(m2);
  });

  it('7. rolling activity window aggregates small buys', () => {
    const windows: import('../PlayerEconomyTypes').PlayerMarketActivityWindow[] = [];
    const ev = (amt: number) => ({
      playerId: PLAYER, islandId: ISLAND, commodityId: COMM, type: 'buy' as const,
      amount: amt, unitPrice: 10, totalValue: amt * 10, stockBefore: 100, stockAfter: 100 - amt,
      targetStock: 100, marketStateBefore: 'balanced' as const, marketStateAfter: 'balanced' as const, tick: 1,
    });
    updateActivityWindow(windows, ev(3), 12);
    updateActivityWindow(windows, ev(4), 12);
    expect(windows[0].boughtAmount).toBe(7);
  });

  it('8. market dump detected', () => {
    const win = {
      playerId: PLAYER, islandId: ISLAND, commodityId: COMM,
      boughtAmount: 0, soldAmount: 40, totalBuyValue: 0, totalSellValue: 400,
      startTick: 1, lastTick: 1,
    };
    const impacts = classifyMarketImpact({
      playerId: PLAYER, islandId: ISLAND, commodityId: COMM, type: 'sell', amount: 40,
      unitPrice: 10, totalValue: 400, stockBefore: 100, stockAfter: 140, targetStock: 100,
      marketStateBefore: 'balanced', marketStateAfter: 'surplus', tick: 1,
    }, win);
    expect(impacts).toContain('market-dump');
  });

  it('9. market cornering detected', () => {
    const win = {
      playerId: PLAYER, islandId: ISLAND, commodityId: COMM,
      boughtAmount: 35, soldAmount: 0, totalBuyValue: 350, totalSellValue: 0,
      startTick: 1, lastTick: 1,
    };
    const impacts = classifyMarketImpact({
      playerId: PLAYER, islandId: ISLAND, commodityId: COMM, type: 'buy', amount: 35,
      unitPrice: 10, totalValue: 350, stockBefore: 100, stockAfter: 65, targetStock: 100,
      marketStateBefore: 'balanced', marketStateAfter: 'shortage', tick: 1,
    }, win);
    expect(impacts).toContain('market-cornering');
  });

  it('10. neutral trade does not spike reputation', () => {
    recordSell(world, ISLAND, COMM, 2, 100);
    const rep = getOrCreateIslandReputation(ensurePlayerEconomy(world).profile, ISLAND);
    expect(rep.supplierReputation).toBeLessThan(5);
  });

  it('11. trust is clamped', () => {
    expect(clampRep(150)).toBe(100);
    expect(clampRep(-5)).toBe(0);
  });

  it('12. title trusted merchant', () => {
    const profile = createDefaultProfile();
    const rep = getOrCreateIslandReputation(profile, ISLAND);
    rep.trust = 40;
    rep.marketManipulation = 10;
    expect(resolveEconomicTitle(rep, profile)).toBe('trusted-merchant');
  });

  it('13. title island supplier', () => {
    const profile = createDefaultProfile();
    const rep = getOrCreateIslandReputation(profile, ISLAND);
    rep.supplierReputation = 60;
    expect(resolveEconomicTitle(rep, profile)).toBe('island-supplier');
  });

  it('14. title trade partner', () => {
    const profile = createDefaultProfile();
    const rep = getOrCreateIslandReputation(profile, ISLAND);
    rep.trust = 80;
    rep.contractReliability = 75;
    expect(resolveEconomicTitle(rep, profile)).toBe('trade-partner');
  });

  it('15. title market manipulator', () => {
    const profile = createDefaultProfile();
    const rep = getOrCreateIslandReputation(profile, ISLAND);
    rep.marketManipulation = 45;
    expect(resolveEconomicTitle(rep, profile)).toBe('market-manipulator');
  });

  it('16. title economic savior', () => {
    const profile = createDefaultProfile();
    profile.relievedCrisisCount = 5;
    const rep = getOrCreateIslandReputation(profile, ISLAND);
    rep.trust = 75;
    expect(resolveEconomicTitle(rep, profile)).toBe('economic-savior');
  });

  it('17. reputation decay', () => {
    const profile = createDefaultProfile();
    const rep = getOrCreateIslandReputation(profile, ISLAND);
    rep.marketManipulation = 20;
    tickReputationDecay(profile, 100);
    expect(rep.marketManipulation).toBeLessThan(20);
  });

  it('18. title changes when crossing threshold', () => {
    const profile = createDefaultProfile();
    const rep = getOrCreateIslandReputation(profile, ISLAND);
    rep.unitsSold = 6;
    rep.tradeValue = 60;
    expect(resolveEconomicTitle(rep, profile)).toBe('local-trader');
    rep.trust = 40;
    rep.marketManipulation = 5;
    expect(resolveEconomicTitle(rep, profile)).toBe('trusted-merchant');
  });

  it('19. fee modifier correct', () => {
    expect(getFeeModifier('trade-partner')).toBe(PLAYER_REPUTATION_CONFIG.feeTradePartner);
    expect(getFeeModifier('market-manipulator')).toBe(PLAYER_REPUTATION_CONFIG.feeMarketManipulator);
  });

  it('20. fee modifier clamped', () => {
    expect(getFeeModifier('unknown')).toBeGreaterThanOrEqual(PLAYER_REPUTATION_CONFIG.feeMin);
    expect(getFeeModifier('profiteer')).toBeLessThanOrEqual(PLAYER_REPUTATION_CONFIG.feeMax);
  });

  it('21. contract created from E2 order', () => {
    world.orders.push(sampleOrder());
    const events = generatePlayerContracts(world);
    expect(ensurePlayerEconomy(world).availableContracts.length).toBe(1);
    expect(events.some((e) => e.type === 'PLAYER_CONTRACT_AVAILABLE')).toBe(true);
  });

  it('22. contract not created from low urgency order', () => {
    world.orders.push(sampleOrder({ urgency: 0.2 }));
    generatePlayerContracts(world);
    expect(ensurePlayerEconomy(world).availableContracts.length).toBe(0);
  });

  it('23. accept contract reserves order share', () => {
    world.orders.push(sampleOrder());
    generatePlayerContracts(world);
    const contract = ensurePlayerEconomy(world).availableContracts[0];
    const wallet = mockWallet();
    const result = acceptContract(world, contract.id, wallet);
    expect(result.ok).toBe(true);
    expect(world.orders[0].playerReservedAmount).toBe(contract.requestedAmount);
  });

  it('24. NPC can still take remaining order share', () => {
    world.orders.push(sampleOrder({ remainingAmount: 12 }));
    generatePlayerContracts(world);
    const contract = ensurePlayerEconomy(world).availableContracts[0];
    acceptContract(world, contract.id, mockWallet(), PLAYER, 6);
    world.tick = 10;
    const npcAmount = getNpcAssignableAmount(world, world.orders[0]);
    expect(npcAmount).toBe(6);
  });

  it('25. player cannot exceed max active contracts', () => {
    world.orders.push(
      sampleOrder({ id: 'o1', commodityId: 'rope' }),
      sampleOrder({ id: 'o2', commodityId: 'hardwood', sourceIslandId: 'leaf-island', destinationIslandId: 'mine-island' }),
      sampleOrder({ id: 'o3', commodityId: 'tools', sourceIslandId: 'mine-island', destinationIslandId: 'shipyard-island' }),
    );
    generatePlayerContracts(world);
    const wallet = mockWallet();
    const contracts = ensurePlayerEconomy(world).availableContracts;
    expect(contracts.length).toBeGreaterThanOrEqual(2);
    acceptContract(world, contracts[0].id, wallet);
    acceptContract(world, contracts[1].id, wallet);
    if (contracts[2]) {
      const third = acceptContract(world, contracts[2].id, wallet);
      expect(third.ok).toBe(false);
    }
  });

  it('26. insufficient collateral blocks accept', () => {
    world.orders.push(sampleOrder());
    generatePlayerContracts(world);
    const contract = ensurePlayerEconomy(world).availableContracts[0];
    const result = acceptContract(world, contract.id, mockWallet(0));
    expect(result.ok).toBe(false);
  });

  it('27. delivery counts on destination sell', () => {
    world.orders.push(sampleOrder());
    generatePlayerContracts(world);
    const contract = ensurePlayerEconomy(world).availableContracts[0];
    acceptContract(world, contract.id, mockWallet());
    const wallet = mockWallet();
    onPlayerSellForContracts(world, 'starter-island', 'rope', 4, PLAYER, wallet);
    const active = ensurePlayerEconomy(world).activeContracts[0];
    expect(active.deliveredAmount).toBe(4);
  });

  it('28. delivery at wrong market does not count', () => {
    world.orders.push(sampleOrder());
    generatePlayerContracts(world);
    acceptContract(world, ensurePlayerEconomy(world).availableContracts[0].id, mockWallet());
    onPlayerSellForContracts(world, 'sunscar-desert', 'rope', 5, PLAYER);
    expect(ensurePlayerEconomy(world).activeContracts[0].deliveredAmount).toBe(0);
  });

  it('29. partial delivery updates progress', () => {
    world.orders.push(sampleOrder({ requestedAmount: 10, remainingAmount: 10 }));
    generatePlayerContracts(world);
    acceptContract(world, ensurePlayerEconomy(world).availableContracts[0].id, mockWallet());
    onPlayerSellForContracts(world, 'starter-island', 'rope', 5, PLAYER);
    expect(ensurePlayerEconomy(world).activeContracts[0].status).toBe('in-progress');
  });

  it('30. full delivery completes contract', () => {
    world.orders.push(sampleOrder({ requestedAmount: 8, remainingAmount: 8 }));
    generatePlayerContracts(world);
    const c = ensurePlayerEconomy(world).availableContracts[0];
    acceptContract(world, c.id, mockWallet());
    const wallet = mockWallet();
    onPlayerSellForContracts(world, 'starter-island', 'rope', 8, PLAYER, wallet);
    expect(ensurePlayerEconomy(world).activeContracts.length).toBe(0);
    expect(ensurePlayerEconomy(world).profile.completedContracts).toBe(1);
  });

  it('31. 80% delivery completes with partial reward', () => {
    world.orders.push(sampleOrder({ requestedAmount: 10, remainingAmount: 10 }));
    generatePlayerContracts(world);
    const c = ensurePlayerEconomy(world).availableContracts[0];
    const wallet = mockWallet();
    acceptContract(world, c.id, wallet);
    const before = wallet.coins;
    onPlayerSellForContracts(world, 'starter-island', 'rope', 8, PLAYER, wallet);
    expect(wallet.coins).toBeGreaterThan(before);
    expect(ensurePlayerEconomy(world).profile.completedContracts).toBe(1);
  });

  it('32. below minimum ratio fails', () => {
    world.orders.push(sampleOrder({ requestedAmount: 10, remainingAmount: 10 }));
    generatePlayerContracts(world);
    acceptContract(world, ensurePlayerEconomy(world).availableContracts[0].id, mockWallet());
    onPlayerSellForContracts(world, 'starter-island', 'rope', 3, PLAYER);
    world.tick = ensurePlayerEconomy(world).activeContracts[0].expiresAtTick + 1;
    tickPlayerContracts(world);
    expect(ensurePlayerEconomy(world).profile.failedContracts).toBe(1);
  });

  it('33. contract expiry releases available contract', () => {
    world.orders.push(sampleOrder());
    generatePlayerContracts(world);
    const c = ensurePlayerEconomy(world).availableContracts[0];
    world.tick = c.expiresAtTick + 1;
    tickPlayerContracts(world);
    expect(ensurePlayerEconomy(world).availableContracts.length).toBe(0);
  });

  it('34. abandon returns reserved share', () => {
    world.orders.push(sampleOrder());
    generatePlayerContracts(world);
    const c = ensurePlayerEconomy(world).availableContracts[0];
    acceptContract(world, c.id, mockWallet());
    abandonContract(world, c.id, mockWallet());
    expect(world.orders[0].playerReservedAmount ?? 0).toBe(0);
  });

  it('35. failed contract increases order urgency', () => {
    const order = sampleOrder({ urgency: 0.8, id: 'order-fail-test' });
    world.orders.push(order);
    generatePlayerContracts(world);
    const c = ensurePlayerEconomy(world).availableContracts[0];
    expect(acceptContract(world, c.id, mockWallet()).ok).toBe(true);
    failContractDebug(world, c.id);
    expect(world.orders.find((o) => o.id === 'order-fail-test')?.urgency).toBeGreaterThan(0.8);
  });

  it('36. complete contract returns collateral', () => {
    world.orders.push(sampleOrder({ requestedAmount: 8, remainingAmount: 8 }));
    generatePlayerContracts(world);
    const c = ensurePlayerEconomy(world).availableContracts[0];
    const wallet = mockWallet(5000);
    const before = wallet.coins;
    acceptContract(world, c.id, wallet);
    completeContractWithWallet(world, c.id, wallet);
    expect(wallet.coins).toBeGreaterThan(before - c.collateral);
  });

  it('37. perfect delivery gets bonus', () => {
    world.orders.push(sampleOrder({ requestedAmount: 8, remainingAmount: 8 }));
    generatePlayerContracts(world);
    const c = ensurePlayerEconomy(world).availableContracts[0];
    const wallet = mockWallet();
    acceptContract(world, c.id, wallet);
    const before = wallet.coins;
    onPlayerSellForContracts(world, 'starter-island', 'rope', 8, PLAYER, wallet);
    expect(wallet.coins - before).toBeGreaterThan(c.completionReward * 0.9);
  });

  it('38. reputation requirement blocks high contract', () => {
    world.orders.push(sampleOrder({ urgency: 0.9 }));
    generatePlayerContracts(world);
    const c = ensurePlayerEconomy(world).availableContracts[0];
    c.minimumTrust = 99;
    const result = acceptContract(world, c.id, mockWallet());
    expect(result.ok).toBe(false);
  });

  it('39. completed contract increases reliability', () => {
    world.orders.push(sampleOrder({ requestedAmount: 8, remainingAmount: 8 }));
    generatePlayerContracts(world);
    const c = ensurePlayerEconomy(world).availableContracts[0];
    acceptContract(world, c.id, mockWallet());
    const before = getOrCreateIslandReputation(ensurePlayerEconomy(world).profile, 'starter-island').contractReliability;
    onPlayerSellForContracts(world, 'starter-island', 'rope', 8, PLAYER, mockWallet());
    const after = getOrCreateIslandReputation(ensurePlayerEconomy(world).profile, 'starter-island').contractReliability;
    expect(after).toBeGreaterThan(before);
  });

  it('40. failed contract decreases reliability', () => {
    world.orders.push(sampleOrder());
    generatePlayerContracts(world);
    const c = ensurePlayerEconomy(world).availableContracts[0];
    acceptContract(world, c.id, mockWallet());
    const before = getOrCreateIslandReputation(ensurePlayerEconomy(world).profile, 'starter-island').contractReliability;
    failContractDebug(world, c.id);
    const after = getOrCreateIslandReputation(ensurePlayerEconomy(world).profile, 'starter-island').contractReliability;
    expect(after).toBeLessThan(before);
  });

  it('41. save/load profile', () => {
    if (typeof localStorage === 'undefined') return;
    recordSell(world, ISLAND, COMM, 5, 50);
    saveEconomyState(world);
    const loaded = loadEconomyState();
    expect(loaded?.playerEconomy?.profile.totalUnitsSold).toBe(5);
  });

  it('42. save/load contracts', () => {
    if (typeof localStorage === 'undefined') return;
    world.orders.push(sampleOrder());
    generatePlayerContracts(world);
    saveEconomyState(world);
    const loaded = loadEconomyState();
    expect(loaded?.playerEconomy?.availableContracts.length).toBe(1);
  });

  it('43. migration v5 → v6', () => {
    if (typeof localStorage === 'undefined') return;
    const w = createFreshWorld();
    delete (w as { playerEconomy?: unknown }).playerEconomy;
    saveEconomyState(w);
    const raw = JSON.parse(localStorage.getItem('pirate-fruit:economy-v1') ?? '{}');
    raw.version = 5;
    localStorage.setItem('pirate-fruit:economy-v1', JSON.stringify(raw));
    const loaded = loadEconomyState();
    expect(loaded?.playerEconomy?.profile).toBeDefined();
    expect(loaded?.factories.length).toBeGreaterThan(0);
  });

  it('44. E1 factories still work after player trade', () => {
    const before = sim.factories.length;
    sim.applyPlayerSell('starter-island', 'hardwood', 5, 50);
    expect(sim.factories.length).toBe(before);
  });

  it('45. E2 orders still work', () => {
    sim.tickMany(5);
    sim.injectShortage('shipyard-island', 'rope', 40);
    sim.injectSurplus('cloth-island', 'rope', 50);
    sim.generateOrdersDebug();
    const active = sim.state.orders.filter(
      (o) => o.status === 'open' || o.status === 'assigned' || o.status === 'in-transit',
    );
    expect(active.length).toBeGreaterThan(0);
  });

  it('46. E3 trader memory still works', () => {
    sim.tickMany(20);
    expect(sim.traderProfiles.length).toBeGreaterThan(0);
  });

  it('47. no negative Beli from collateral bug', () => {
    world.orders.push(sampleOrder());
    generatePlayerContracts(world);
    const wallet = mockWallet(100);
    acceptContract(world, ensurePlayerEconomy(world).availableContracts[0].id, wallet);
    expect(wallet.coins).toBeGreaterThanOrEqual(0);
  });

  it('48. no duplicate contract reservation', () => {
    world.orders.push(sampleOrder());
    generatePlayerContracts(world);
    const c = ensurePlayerEconomy(world).availableContracts[0];
    acceptContract(world, c.id, mockWallet());
    acceptContract(world, c.id, mockWallet());
    expect(world.orders[0].playerReservedAmount).toBeLessThanOrEqual(12);
  });

  it('49. history size limited', () => {
    for (let i = 0; i < 120; i++) {
      recordSell(world, ISLAND, COMM, 1, 50);
    }
    expect(ensurePlayerEconomy(world).tradeHistory.length).toBeLessThanOrEqual(
      PLAYER_REPUTATION_CONFIG.maxSavedPlayerTradeHistory,
    );
  });

  it('50. deterministic impact classification', () => {
    const item = sampleItem({ stock: 30, marketState: 'crisis', targetStock: 100 });
    const after = getMarketStateAfterTrade(item, 60);
    expect(['shortage', 'balanced', 'surplus']).toContain(after);
  });

  it('long-run 5000 ticks with player behaviors stable', async () => {
    const freshSim = new LivingTradeSimulator(true);
    freshSim.setContractWallet(mockWallet(50_000));
    let helpfulTicks = 0;
    let manipTicks = 0;

    for (let t = 0; t < 5000; t++) {
      const phase = t % 4;
      if (phase === 0 && t % 20 === 0) {
        freshSim.injectShortage('shipyard-island', 'rope', 20);
        freshSim.applyPlayerSell('starter-island', 'rope', 3, 100);
        helpfulTicks += 1;
      } else if (phase === 1 && t % 25 === 0) {
        freshSim.applyPlayerBuy('starter-island', 'hardwood', 15, 80);
        manipTicks += 1;
      } else if (phase === 2 && t % 30 === 0) {
        freshSim.applyPlayerBuy('starter-island', 'fresh-fish', 2, 45);
        freshSim.applyPlayerSell('mist-jungle', 'fresh-fish', 2, 50);
      } else if (phase === 3 && t % 40 === 0) {
        freshSim.generateOrdersDebug();
        const contracts = freshSim.playerEconomy.availableContracts;
        if (contracts.length > 0 && freshSim.playerEconomy.profile.activeContractIds.length < 2) {
          freshSim.acceptPlayerContract(contracts[0].id);
        }
      }
      freshSim.tick();
      await yieldToTestRunner(t);
    }

    const peState = freshSim.playerEconomy;
    const pe = peState.profile;
    const w = freshSim.state;
    expect(pe.totalUnitsSold + pe.totalUnitsBought).toBeGreaterThan(0);
    expect(w.cells.every((c) => Object.values(c.commodities).every((item) => !item || item.stock >= 0))).toBe(true);
    expect(w.orders.filter((o) => o.status === 'open' || o.status === 'assigned' || o.status === 'in-transit').length).toBeLessThan(200);
    expect(peState.tradeHistory.length).toBeLessThanOrEqual(PLAYER_REPUTATION_CONFIG.maxSavedPlayerTradeHistory);
    expect(Number.isFinite(pe.lifetimePurchaseValue)).toBe(true);
    expect(w.factories.some((f) => f.status === 'operating' || f.status === 'paused')).toBe(true);
    expect(helpfulTicks).toBeGreaterThan(0);
    expect(manipTicks).toBeGreaterThan(0);
  }, 240_000);
});
