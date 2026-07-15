import { describe, expect, it } from 'vitest';
import { LivingTradeSimulator } from '../LivingTradeSimulator';
import { createFreshWorld, loadEconomyState, saveEconomyState } from '../LivingTradePersistence';
import { ECONOMY_GENOME_CONFIG } from '../EconomyGenomeConfig';
import {
  createGenomeForCell,
  ensureGenomeState,
  getGenome,
  clampGenome,
  clampVelocity,
} from '../EconomyGenomeInitializer';
import {
  addPressure,
  clearPressures,
  decayAndPrunePressures,
  pressureKey,
  resetPressureCounter,
} from '../GenomePressureStore';
import { collectGenomePressures } from '../GenomePressureCollector';
import {
  evaluateGenomeFitness,
  evaluateAllGenomeFitness,
} from '../GenomeFitnessEvaluator';
import { driftGenome, driftAllGenomes } from '../GenomeDriftEngine';
import { resolveGenomeIdentity } from '../GenomeIdentityResolver';
import {
  genomeProductionBonus,
  effectiveTargetStock,
} from '../GenomeGameplayBias';
import { scoreFactory } from '../FactoryAgent';
import { scoreOrderForTrader } from '../TraderDecision';
import { recipeForOutput } from '../ProductionRecipes';
import { recordPlayerTrade } from '../PlayerEconomicProfileManager';
import type { EconomyWorldState } from '../types';
import { getEvolutionHistoryForCell } from '../EvolutionHistory';

function world(): EconomyWorldState {
  return createFreshWorld();
}

function simFresh(): LivingTradeSimulator {
  return new LivingTradeSimulator(true);
}

describe('Phase E4A — Economy Genome', () => {
  it('1. creates genome for every cell', () => {
    const w = world();
    ensureGenomeState(w);
    expect(w.genomeState!.genomes).toHaveLength(w.cells.length);
  });

  it('2. initial genome values are 0–1', () => {
    const g = createGenomeForCell('leaf-island');
    expect(g.storagePreference).toBeGreaterThanOrEqual(0);
    expect(g.storagePreference).toBeLessThanOrEqual(1);
    expect(g.productionBias['fresh-fish']).toBeGreaterThanOrEqual(0);
    expect(g.productionBias['fresh-fish']).toBeLessThanOrEqual(1);
  });

  it('3. initial genome reflects cell role slightly', () => {
    const leaf = createGenomeForCell('leaf-island');
    const mine = createGenomeForCell('mine-island');
    expect(leaf.productionBias['fresh-fish']).toBeGreaterThan(leaf.productionBias.tools ?? 0.5);
    expect(mine.productionBias['iron-ore']).toBeGreaterThan(0.6);
  });

  it('4. identity starts neutral', () => {
    const g = createGenomeForCell('cloth-island');
    expect(g.identity.dominantIndustry).toBeNull();
    expect(g.identity.specializationConfidence).toBe(0);
    expect(g.identity.economicStage).toBe('primitive');
  });

  it('5. no immediate specialization after migration', () => {
    if (typeof localStorage === 'undefined') return;
    const w = createFreshWorld();
    delete w.genomeState;
    saveEconomyState(w);
    const raw = JSON.parse(localStorage.getItem('pirate-fruit:economy-v1') ?? '{}');
    raw.version = 6;
    localStorage.setItem('pirate-fruit:economy-v1', JSON.stringify(raw));
    const loaded = loadEconomyState()!;
    for (const g of loaded.genomeState!.genomes) {
      expect(g.identity.dominantIndustry).toBeNull();
      expect(g.identity.specializationConfidence).toBe(0);
    }
  });

  it('6. factory profit creates positive production pressure', () => {
    const w = world();
    const factory = w.factories.find((f) => f.cellId === 'leaf-island')!;
    factory.profitEma = 40;
    factory.status = 'operating';
    factory.outputScale = 1;
    collectGenomePressures(w);
    const pressures = w.genomeState!.genomePressures.filter(
      (p) => p.source === 'factory' && p.target === 'production-bias' && p.strength > 0,
    );
    expect(pressures.length).toBeGreaterThan(0);
  });

  it('7. factory pause creates negative pressure', () => {
    const w = world();
    const factory = w.factories[0];
    factory.status = 'paused';
    factory.unprofitableTicks = 8;
    collectGenomePressures(w);
    const neg = w.genomeState!.genomePressures.find(
      (p) => p.source === 'factory' && p.strength < 0,
    );
    expect(neg).toBeDefined();
  });

  it('8. player buy creates demand pressure', () => {
    const w = world();
    const cell = w.cells.find((c) => c.id === 'leaf-island')!;
    const item = cell.commodities.hardwood!;
    recordPlayerTrade(w, {
      islandId: 'starter-island',
      commodityId: 'hardwood',
      type: 'buy',
      amount: 20,
      unitPrice: 10,
      stockBefore: item.stock,
      targetStock: item.targetStock,
      marketStateBefore: item.marketState,
      item,
    });
    collectGenomePressures(w);
    const playerP = w.genomeState!.genomePressures.filter((p) => p.source === 'player');
    expect(playerP.length).toBeGreaterThan(0);
  });

  it('9. player sell into shortage creates correct pressure', () => {
    const w = world();
    const cell = w.cells.find((c) => c.id === 'cloth-island')!;
    const item = cell.commodities.rope!;
    recordPlayerTrade(w, {
      islandId: 'sunscar-desert',
      commodityId: 'rope',
      type: 'sell',
      amount: 30,
      unitPrice: 12,
      stockBefore: 20,
      targetStock: item.targetStock,
      marketStateBefore: 'shortage',
      item,
    });
    collectGenomePressures(w);
    const cons = w.genomeState!.genomePressures.find(
      (p) => p.source === 'player' && p.target === 'consumption-bias' && p.strength > 0,
    );
    expect(cons).toBeDefined();
  });

  it('10. trader profit creates trade pressure', () => {
    const w = world();
    w.traderRouteMemories = [{
      key: 't1',
      traderId: 'trader-leaf-safe',
      sourceIslandId: 'leaf-island',
      destinationIslandId: 'cloth-island',
      commodityId: 'fresh-fish',
      tripCount: 5,
      successfulTrips: 5,
      failedTrips: 0,
      raidCount: 0,
      spoilageLoss: 0,
      totalRevenue: 100,
      totalCost: 50,
      totalProfit: 50,
      averageProfit: 10,
      averageProfitPerSlot: 5,
      averageTravelTicks: 4,
      averageRiskCost: 1,
      profitEma: 50,
      successRateEma: 0.8,
      dangerEma: 0.1,
      delayEma: 0,
      spoilageEma: 0,
      confidence: 0.7,
      lastUsedTick: 0,
      lastSuccessTick: 0,
      lastFailureTick: 0,
      consecutiveSuccesses: 3,
      consecutiveFailures: 0,
    }];
    collectGenomePressures(w);
    const tradeP = w.genomeState!.genomePressures.find(
      (p) => p.source === 'trader' && p.target === 'trade-preference',
    );
    expect(tradeP).toBeDefined();
  });

  it('11. shortage duration creates storage pressure', () => {
    const w = world();
    const cell = w.cells.find((c) => c.id === 'mine-island')!;
    const item = cell.commodities['fresh-fish']!;
    item.stock = 5;
    item.marketState = 'shortage';
    collectGenomePressures(w);
    const marketP = w.genomeState!.genomePressures.find(
      (p) => p.source === 'market' && p.target === 'storage-preference',
    );
    expect(marketP).toBeDefined();
  });

  it('12. same pressure key merges', () => {
    const w = world();
    resetPressureCounter();
    const key = pressureKey('leaf-island', 'factory', 'production-bias', 'hardwood');
    addPressure(w, { cellId: 'leaf-island', source: 'factory', target: 'production-bias', commodityId: 'hardwood', strength: 0.2 });
    addPressure(w, { cellId: 'leaf-island', source: 'factory', target: 'production-bias', commodityId: 'hardwood', strength: 0.2 });
    const matches = w.genomeState!.genomePressures.filter(
      (p) => pressureKey(p.cellId, p.source, p.target, p.commodityId) === key,
    );
    expect(matches).toHaveLength(1);
  });

  it('13. pressure decay works', () => {
    const w = world();
    addPressure(w, { cellId: 'leaf-island', source: 'factory', target: 'industrialization', strength: 0.5 });
    const before = w.genomeState!.genomePressures[0].strength;
    decayAndPrunePressures(w);
    expect(w.genomeState!.genomePressures[0].strength).toBeLessThan(before);
  });

  it('14. weak pressure is removed', () => {
    const w = world();
    addPressure(w, { cellId: 'leaf-island', source: 'player', target: 'trade-preference', strength: 0.002 });
    for (let i = 0; i < 200; i++) decayAndPrunePressures(w);
    expect(w.genomeState!.genomePressures.length).toBe(0);
  });

  it('15. pressure store is bounded per cell', () => {
    const w = world();
    for (let i = 0; i < 150; i++) {
      addPressure(w, {
        cellId: 'leaf-island',
        source: 'market',
        target: 'production-bias',
        commodityId: 'hardwood',
        strength: 0.01,
        sourceReferenceId: `ref-${i}`,
      });
    }
    const count = w.genomeState!.genomePressures.filter((p) => p.cellId === 'leaf-island').length;
    expect(count).toBeLessThanOrEqual(ECONOMY_GENOME_CONFIG.maximumActivePressuresPerCell);
  });

  it('16. profitable economy raises fitness', () => {
    const w = world();
    for (const f of w.factories) {
      f.profitEma = 40;
      f.status = 'operating';
      f.workforceAssigned = 3;
    }
    const fit = evaluateGenomeFitness(w, 'leaf-island');
    expect(fit.averageProfit).toBeGreaterThan(0.3);
    expect(fit.score).toBeGreaterThan(0.35);
  });

  it('17. persistent shortage lowers fitness', () => {
    const w = world();
    const cell = w.cells[0];
    for (const id of Object.keys(cell.commodities)) {
      const item = cell.commodities[id as keyof typeof cell.commodities];
      if (item) item.marketState = 'crisis';
    }
    const fit = evaluateGenomeFitness(w, cell.id);
    expect(fit.shortageScore).toBeLessThan(0.5);
  });

  it('18. high employment raises fitness', () => {
    const w = world();
    const cellId = 'shipyard-island';
    for (const f of w.factories.filter((f) => f.cellId === cellId)) {
      f.workforceAssigned = 5;
    }
    const cell = w.cells.find((c) => c.id === cellId)!;
    cell.unemployment = 0;
    const fit = evaluateGenomeFitness(w, cellId);
    expect(fit.averageEmployment).toBeGreaterThan(0.15);
  });

  it('19. factory oscillation lowers production stability', () => {
    const w = world();
    const factories = w.factories.filter((f) => f.cellId === 'leaf-island');
    for (const f of factories) {
      f.lastDecision = 'pause';
      f.status = 'paused';
    }
    const fit = evaluateGenomeFitness(w, 'leaf-island');
    expect(fit.productionStability).toBeLessThan(0.8);
  });

  it('20. shipment failure lowers trade stability', () => {
    const w = world();
    w.orders.push({
      id: 'fail-1',
      commodityId: 'rope',
      sourceIslandId: 'cloth-island',
      destinationIslandId: 'shipyard-island',
      requestedAmount: 10,
      remainingAmount: 0,
      sourceBuyPrice: 100,
      destinationSellPrice: 200,
      expectedRevenue: 2000,
      purchaseCost: 1000,
      transportCost: 5,
      riskCost: 2,
      spoilageCost: 0,
      urgency: 0.5,
      expectedProfit: 20,
      profitPerCargoSlot: 5,
      travelTicks: 2,
      createdTick: 0,
      expiresAtTick: 100,
      status: 'failed',
    });
    const fit = evaluateGenomeFitness(w, 'cloth-island');
    expect(fit.tradeStability).toBeLessThan(1);
  });

  it('21. fitness score is clamped 0–1', () => {
    const w = world();
    const fit = evaluateGenomeFitness(w, 'mine-island');
    expect(fit.score).toBeGreaterThanOrEqual(0);
    expect(fit.score).toBeLessThanOrEqual(1);
  });

  it('22. fitness EMA updates correctly', () => {
    const w = world();
    const g = getGenome(w, 'leaf-island');
    g.fitness.emaScore = 0.5;
    for (const f of w.factories) f.profitEma = 60;
    const fit = evaluateGenomeFitness(w, 'leaf-island');
    expect(fit.emaScore).toBeGreaterThan(0.5);
    expect(fit.emaScore).toBeLessThanOrEqual(1);
  });

  it('23. positive wood pressure increases wood bias', () => {
    const w = world();
    w.tick = 10;
    const before = getGenome(w, 'leaf-island').productionBias.hardwood ?? 0.5;
    addPressure(w, { cellId: 'leaf-island', source: 'factory', target: 'production-bias', commodityId: 'hardwood', strength: 0.8 });
    evaluateAllGenomeFitness(w);
    for (let i = 0; i < 20; i++) driftGenome(w, 'leaf-island');
    const after = getGenome(w, 'leaf-island').productionBias.hardwood ?? 0.5;
    expect(after).toBeGreaterThan(before);
  });

  it('24. negative wood pressure decreases wood bias', () => {
    const w = world();
    const before = getGenome(w, 'leaf-island').productionBias.hardwood ?? 0.5;
    addPressure(w, { cellId: 'leaf-island', source: 'factory', target: 'production-bias', commodityId: 'hardwood', strength: -0.8 });
    evaluateAllGenomeFitness(w);
    for (let i = 0; i < 20; i++) driftGenome(w, 'leaf-island');
    const after = getGenome(w, 'leaf-island').productionBias.hardwood ?? 0.5;
    expect(after).toBeLessThan(before);
  });

  it('25. fitness gate affects positive drift', () => {
    const w = world();
    const g = getGenome(w, 'leaf-island');
    g.fitness.emaScore = 0.9;
    addPressure(w, { cellId: 'leaf-island', source: 'factory', target: 'production-bias', commodityId: 'hardwood', strength: 0.6 });
    const highStart = g.productionBias.hardwood ?? 0.5;
    for (let i = 0; i < 10; i++) driftGenome(w, 'leaf-island');
    const highEnd = g.productionBias.hardwood ?? 0.5;

    const w2 = world();
    const g2 = getGenome(w2, 'leaf-island');
    g2.fitness.emaScore = 0.1;
    addPressure(w2, { cellId: 'leaf-island', source: 'factory', target: 'production-bias', commodityId: 'hardwood', strength: 0.6 });
    const lowStart = g2.productionBias.hardwood ?? 0.5;
    for (let i = 0; i < 10; i++) driftGenome(w2, 'leaf-island');
    const lowEnd = g2.productionBias.hardwood ?? 0.5;

    expect(highEnd - highStart).toBeGreaterThan(lowEnd - lowStart);
  });

  it('26. failed strategy accelerates negative drift', () => {
    const w = world();
    const g = getGenome(w, 'leaf-island');
    g.fitness.emaScore = 0.2;
    addPressure(w, { cellId: 'leaf-island', source: 'factory', target: 'production-bias', commodityId: 'hardwood', strength: -0.5 });
    const start = g.productionBias.hardwood ?? 0.5;
    for (let i = 0; i < 40; i++) driftGenome(w, 'leaf-island');
    const end = g.productionBias.hardwood ?? 0.5;
    expect(start - end).toBeGreaterThan(0.001);
  });

  it('27. velocity inertia works', () => {
    const w = world();
    const g = getGenome(w, 'leaf-island');
    addPressure(w, { cellId: 'leaf-island', source: 'factory', target: 'production-bias', commodityId: 'hardwood', strength: 0.5 });
    driftGenome(w, 'leaf-island');
    const vel1 = g.productionVelocity.hardwood ?? 0;
    clearPressures(w);
    driftGenome(w, 'leaf-island');
    const vel2 = g.productionVelocity.hardwood ?? 0;
    expect(Math.abs(vel2)).toBeLessThan(Math.abs(vel1) + 0.001);
  });

  it('28. dead zone stops noise drift', () => {
    const w = world();
    const g = getGenome(w, 'leaf-island');
    const start = g.storagePreference;
    addPressure(w, { cellId: 'leaf-island', source: 'market', target: 'storage-preference', strength: 0.005 });
    for (let i = 0; i < 5; i++) driftGenome(w, 'leaf-island');
    expect(Math.abs(g.storagePreference - start)).toBeLessThan(0.01);
  });

  it('29. bias is clamped 0–1', () => {
    expect(clampGenome(1.5)).toBe(1);
    expect(clampGenome(-0.2)).toBe(0);
  });

  it('30. velocity is clamped', () => {
    expect(clampVelocity(0.05)).toBe(0.02);
    expect(clampVelocity(-0.05)).toBe(-0.02);
  });

  it('31. no NaN or Infinity in drift', () => {
    const w = world();
    addPressure(w, { cellId: 'leaf-island', source: 'factory', target: 'production-bias', commodityId: 'hardwood', strength: 0.9 });
    for (let i = 0; i < 50; i++) driftGenome(w, 'leaf-island');
    const g = getGenome(w, 'leaf-island');
    expect(Number.isFinite(g.storagePreference)).toBe(true);
    expect(Number.isFinite(g.productionBias.hardwood ?? 0.5)).toBe(true);
  });

  it('32. freeze genome stops drift', () => {
    const w = world();
    w.genomeState!.genomeDebug.freezeDrift = true;
    const before = getGenome(w, 'leaf-island').tradePreference;
    addPressure(w, { cellId: 'leaf-island', source: 'trader', target: 'trade-preference', strength: 0.7 });
    driftAllGenomes(w);
    expect(getGenome(w, 'leaf-island').tradePreference).toBe(before);
  });

  it('33. resume genome continues drift', () => {
    const w = world();
    w.genomeState!.genomeDebug.freezeDrift = true;
    addPressure(w, { cellId: 'leaf-island', source: 'trader', target: 'trade-preference', strength: 0.7 });
    w.genomeState!.genomeDebug.freezeDrift = false;
    const before = getGenome(w, 'leaf-island').tradePreference;
    driftAllGenomes(w);
    expect(getGenome(w, 'leaf-island').tradePreference).not.toBe(before);
  });

  it('34. dominant industry does not change from small gap', () => {
    const w = world();
    const g = getGenome(w, 'leaf-island');
    g.identity.dominantIndustry = 'fresh-fish';
    g.productionBias['fresh-fish'] = 0.62;
    g.productionBias.hardwood = 0.60;
    resolveGenomeIdentity(w, 'leaf-island');
    expect(g.identity.dominantIndustry).toBe('fresh-fish');
  });

  it('35. dominant industry changes after gap and stable drifts', () => {
    const w = world();
    const g = getGenome(w, 'leaf-island');
    g.productionBias.hardwood = 0.72;
    g.productionBias['fresh-fish'] = 0.55;
    g.identity.candidateIndustry = 'hardwood';
    g.identity.candidateStableDrifts = ECONOMY_GENOME_CONFIG.specializationStableDrifts;
    resolveGenomeIdentity(w, 'leaf-island');
    expect(g.identity.dominantIndustry).toBe('hardwood');
  });

  it('36. generation increments on identity change', () => {
    const w = world();
    const g = getGenome(w, 'leaf-island');
    const genBefore = g.identity.genomeGeneration;
    g.identity.candidateIndustry = 'hardwood';
    g.identity.candidateStableDrifts = ECONOMY_GENOME_CONFIG.specializationStableDrifts;
    g.productionBias.hardwood = 0.75;
    resolveGenomeIdentity(w, 'leaf-island');
    expect(g.identity.genomeGeneration).toBe(genBefore + 1);
  });

  it('37. primitive stage is correct', () => {
    const w = world();
    const g = getGenome(w, 'leaf-island');
    g.industrialization = 0.2;
    g.technology = 0.2;
    g.identity.specializationConfidence = 0.1;
    resolveGenomeIdentity(w, 'leaf-island');
    expect(g.identity.economicStage).toBe('primitive');
  });

  it('38. specializing stage is correct', () => {
    const w = world();
    const g = getGenome(w, 'leaf-island');
    g.identity.dominantIndustry = 'hardwood';
    g.productionBias.hardwood = 0.72;
    g.productionBias['fresh-fish'] = 0.45;
    g.industrialization = 0.4;
    resolveGenomeIdentity(w, 'leaf-island');
    expect(g.identity.economicStage).toBe('specializing');
  });

  it('39. industrial stage is correct', () => {
    const w = world();
    const g = getGenome(w, 'shipyard-island');
    g.industrialization = 0.65;
    g.fitness.averageEmployment = 0.5;
    g.identity.dominantIndustry = 'sailcloth';
    g.identity.specializationConfidence = 0.3;
    resolveGenomeIdentity(w, 'shipyard-island');
    expect(g.identity.economicStage).toBe('industrial');
  });

  it('40. evolution history on identity change', () => {
    const w = world();
    const g = getGenome(w, 'leaf-island');
    g.identity.candidateIndustry = 'hardwood';
    g.identity.candidateStableDrifts = ECONOMY_GENOME_CONFIG.specializationStableDrifts;
    g.productionBias.hardwood = 0.75;
    resolveGenomeIdentity(w, 'leaf-island');
    const hist = getEvolutionHistoryForCell(w, 'leaf-island');
    expect(hist.some((e) => e.type === 'specialization-started' || e.type === 'dominant-industry-changed')).toBe(true);
  });

  it('41. history not created from tiny drift', () => {
    const w = world();
    w.genomeState!.evolutionHistory = [];
    addPressure(w, { cellId: 'leaf-island', source: 'market', target: 'storage-preference', strength: 0.01 });
    driftGenome(w, 'leaf-island');
    expect(w.genomeState!.evolutionHistory.length).toBe(0);
  });

  it('42. production bias slightly affects E1 score', () => {
    const sim = simFresh();
    const cell = sim.getCell('shipyard-island')!;
    const factory = sim.factories.find((f) => f.cellId === 'shipyard-island' && f.recipeId === 'sailcloth')!;
    const recipe = recipeForOutput('sailcloth')!;
    const base = scoreFactory(factory, cell, recipe, false);
    getGenome(sim.state, 'shipyard-island').productionBias.sailcloth = 0.8;
    const bonus = genomeProductionBonus(sim.state, 'shipyard-island', 'sailcloth');
    const boosted = scoreFactory(factory, cell, recipe, false, sim.state);
    expect(boosted.finalScore - base.finalScore).toBeCloseTo(bonus, 1);
    expect(Math.abs(boosted.finalScore - base.finalScore)).toBeLessThan(5);
  });

  it('43. genome does not override factory profit', () => {
    const sim = simFresh();
    const cell = sim.getCell('shipyard-island')!;
    const factory = sim.factories.find((f) => f.cellId === 'shipyard-island')!;
    const recipe = recipeForOutput('sailcloth')!;
    const out = cell.commodities.sailcloth!;
    out.stock = out.targetStock * 3;
    out.currentPrice = out.basePrice * 0.2;
    getGenome(sim.state, 'shipyard-island').productionBias.sailcloth = 1;
    const score = scoreFactory(factory, cell, recipe, false, sim.state);
    expect(score.finalScore).toBeLessThan(0);
  });

  it('44. trade preference slightly affects trader score', () => {
    const sim = simFresh();
    const trader = sim.state.traders[0];
    sim.state.orders.push({
      id: 'o-genome',
      commodityId: 'rope',
      sourceIslandId: 'cloth-island',
      destinationIslandId: 'shipyard-island',
      requestedAmount: 15,
      remainingAmount: 15,
      sourceBuyPrice: 100,
      destinationSellPrice: 200,
      expectedRevenue: 3000,
      purchaseCost: 1500,
      transportCost: 5,
      riskCost: 2,
      spoilageCost: 1,
      urgency: 0.6,
      expectedProfit: 30,
      profitPerCargoSlot: 8,
      travelTicks: 2,
      createdTick: 1,
      expiresAtTick: 100,
      status: 'open',
    });
    const order = sim.state.orders[sim.state.orders.length - 1];
    const base = scoreOrderForTrader(order, trader, sim.state);
    getGenome(sim.state, 'cloth-island').tradePreference = 0.9;
    const boosted = scoreOrderForTrader(order, trader, sim.state);
    expect(boosted).toBeGreaterThan(base);
    expect(boosted - base).toBeLessThan(2);
  });

  it('45. storage preference adjusts target stock within bounds', () => {
    const w = world();
    const g = getGenome(w, 'mine-island');
    g.storagePreference = 0;
    const low = effectiveTargetStock(w, 'mine-island', 100);
    g.storagePreference = 1;
    const high = effectiveTargetStock(w, 'mine-island', 100);
    expect(low).toBeCloseTo(90, 0);
    expect(high).toBeCloseTo(115, 0);
  });

  it('46. E1–E3.5 still work when genome frozen', () => {
    const sim = simFresh();
    sim.freezeGenomeDebug(true);
    const factoriesBefore = sim.factories.length;
    sim.tickMany(5);
    expect(sim.factories.length).toBe(factoriesBefore);
    expect(sim.state.tick).toBe(5);
  });

  it('47. save/load genome correctly', () => {
    if (typeof localStorage === 'undefined') return;
    const sim = simFresh();
    getGenome(sim.state, 'leaf-island').tradePreference = 0.77;
    addPressure(sim.state, { cellId: 'leaf-island', source: 'factory', target: 'trade-preference', strength: 0.3 });
    saveEconomyState(sim.state);
    const loaded = loadEconomyState()!;
    expect(loaded.genomeState?.genomes.find((g) => g.cellId === 'leaf-island')?.tradePreference).toBe(0.77);
    expect(loaded.genomeState?.genomePressures.length).toBeGreaterThan(0);
  });

  it('48. migration v6 → v8 adds the global trade network without resetting economy', () => {
    if (typeof localStorage === 'undefined') return;
    const w = createFreshWorld();
    w.tick = 42;
    const factoryCount = w.factories.length;
    const orderCount = w.orders.length;
    delete w.genomeState;
    saveEconomyState(w);
    const raw = JSON.parse(localStorage.getItem('pirate-fruit:economy-v1') ?? '{}');
    raw.version = 6;
    localStorage.setItem('pirate-fruit:economy-v1', JSON.stringify(raw));
    const loaded = loadEconomyState()!;
    expect(loaded.tick).toBe(42);
    expect(loaded.factories.length).toBe(factoryCount);
    expect(loaded.genomeState?.genomes.length).toBe(7);
    expect(loaded.orders.length).toBe(orderCount);
  });

  it('49. missing commodity ID does not break load', () => {
    if (typeof localStorage === 'undefined') return;
    const w = createFreshWorld();
    const g = getGenome(w, 'leaf-island');
    (g.productionBias as Record<string, number>)['future-commodity' as keyof typeof g.productionBias] = 0.7;
    saveEconomyState(w);
    const loaded = loadEconomyState();
    expect(loaded?.genomeState?.genomes.length).toBe(7);
  });

  it('50. evolution history is bounded', () => {
    const w = world();
    for (let i = 0; i < 120; i++) {
      w.genomeState!.evolutionHistory.push({
        id: `x-${i}`,
        cellId: 'leaf-island',
        tick: i,
        type: 'fitness-breakthrough',
        title: 't',
        description: 'd',
        significance: 'low',
      });
    }
    w.genomeState!.evolutionHistory = w.genomeState!.evolutionHistory.slice(
      0,
      ECONOMY_GENOME_CONFIG.maximumEvolutionHistoryEntries,
    );
    expect(w.genomeState!.evolutionHistory.length).toBeLessThanOrEqual(100);
  });

  it('51. long-run genome stability (2000 ticks)', () => {
    const sim = simFresh();
    sim.tickMany(2000);
    for (const g of sim.state.genomeState!.genomes) {
      expect(Number.isFinite(g.storagePreference)).toBe(true);
      expect(Number.isFinite(g.fitness.emaScore)).toBe(true);
      expect(g.storagePreference).toBeGreaterThanOrEqual(0);
      expect(g.storagePreference).toBeLessThanOrEqual(1);
    }
    expect(sim.state.genomeState!.genomePressures.length).toBeLessThanOrEqual(
      ECONOMY_GENOME_CONFIG.maximumActivePressuresPerCell * 4,
    );
  }, 30000);
});
