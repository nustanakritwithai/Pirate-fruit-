import { describe, expect, it } from 'vitest';
import { ADAPTIVE_ECONOMY } from '../AdaptiveEconomyConfig';
import {
  createDefaultAgent,
  debugForcePause,
  debugForceReopen,
  evaluateBestRecipe,
  getExpectedPrice,
  scoreFactory,
  updateFactoryAgent,
} from '../FactoryAgent';
import { canProduceRecipeScaled, runProduction } from '../EconomyRules';
import { createFreshWorld } from '../LivingTradePersistence';
import { LivingTradeSimulator } from '../LivingTradeSimulator';
import { LIVING_COMMODITY_META, recipeForOutput } from '../ProductionRecipes';
import { updateAdaptiveEconomy, ensureFactoryAgents } from '../AdaptiveEconomy';
import type { EconomyCellState, FactoryAgentState } from '../types';
import { runTicksCooperatively } from './soakTestUtils';

function yard(sim: LivingTradeSimulator): EconomyCellState {
  return sim.getCell('shipyard-island')!;
}

function sailFactory(sim: LivingTradeSimulator): FactoryAgentState {
  return sim.factories.find(
    (f) => f.cellId === 'shipyard-island' && f.recipeId === 'sailcloth',
  )!;
}

function forceUnprofitable(cell: EconomyCellState, recipeId: 'sailcloth'): void {
  const recipe = recipeForOutput(recipeId)!;
  const out = cell.commodities[recipe.id]!;
  out.stock = out.targetStock * 2;
  out.currentPrice = out.basePrice * 0.3;
  out.memory.averagePrice = out.basePrice * 0.3;
  for (const inputId of Object.keys(recipe.inputs) as (keyof typeof recipe.inputs)[]) {
    const input = cell.commodities[inputId as keyof typeof cell.commodities];
    if (input) {
      input.currentPrice = input.basePrice * 3;
      input.memory.averagePrice = input.basePrice * 3;
    }
  }
}

function forceProfitable(cell: EconomyCellState, recipeId: 'sailcloth'): void {
  const recipe = recipeForOutput(recipeId)!;
  const out = cell.commodities[recipe.id]!;
  out.stock = 0;
  out.currentPrice = out.basePrice * 2.5;
  out.memory.averagePrice = out.basePrice * 2.2;
  for (const inputId of Object.keys(recipe.inputs) as (keyof typeof recipe.inputs)[]) {
    const input = cell.commodities[inputId as keyof typeof cell.commodities];
    if (input) {
      input.stock = input.targetStock * 2;
      input.currentPrice = input.basePrice * 0.5;
      input.memory.averagePrice = input.basePrice * 0.5;
    }
  }
}

describe('Phase E1 — Adaptive Factory', () => {
  it('1. creates factory agents on fresh world', () => {
    const sim = new LivingTradeSimulator(true);
    expect(sim.factories.length).toBeGreaterThan(5);
    expect(sailFactory(sim).status).toBe('operating');
  });

  it('2. expected price blends average and current', () => {
    const sim = new LivingTradeSimulator(true);
    const item = sim.getCommodity('shipyard-island', 'sailcloth')!;
    item.currentPrice = 500;
    item.memory.averagePrice = 100;
    const expected = getExpectedPrice(item);
    expect(expected).toBeGreaterThan(100);
    expect(expected).toBeLessThan(500);
  });

  it('3. scores include input labor and maintenance costs', () => {
    const sim = new LivingTradeSimulator(true);
    const cell = yard(sim);
    const factory = sailFactory(sim);
    const recipe = recipeForOutput('sailcloth')!;
    const score = scoreFactory(factory, cell, recipe);
    expect(score.inputCost).toBeGreaterThan(0);
    expect(score.laborCost).toBeGreaterThan(0);
    expect(score.maintenanceCost).toBeGreaterThan(0);
  });

  it('4. unprofitable factory reduces output scale', () => {
    const sim = new LivingTradeSimulator(true);
    const cell = yard(sim);
    const factory = sailFactory(sim);
    forceUnprofitable(cell, 'sailcloth');
    const start = factory.outputScale;
    for (let i = 0; i < 6; i++) {
      factory.adaptationCooldown = 0;
      factory.unprofitableTicks = ADAPTIVE_ECONOMY.unprofitableTicksToReduce;
      updateFactoryAgent(factory, cell);
    }
    expect(factory.outputScale).toBeLessThan(start);
    expect(['reducing', 'paused', 'operating']).toContain(factory.status);
  });

  it('5. heavy loss pauses factory at minimum scale', () => {
    const sim = new LivingTradeSimulator(true);
    const cell = yard(sim);
    const factory = sailFactory(sim);
    factory.outputScale = ADAPTIVE_ECONOMY.scaleMin;
    forceUnprofitable(cell, 'sailcloth');
    factory.unprofitableTicks = ADAPTIVE_ECONOMY.unprofitableTicksToPause;
    factory.adaptationCooldown = 0;
    updateFactoryAgent(factory, cell);
    expect(factory.status).toBe('paused');
    expect(factory.outputScale).toBe(0);
  });

  it('6. paused factory scores zero while forecast evaluates reopen potential', () => {
    const sim = new LivingTradeSimulator(true);
    const cell = yard(sim);
    const factory = sailFactory(sim);
    const recipe = recipeForOutput('sailcloth')!;
    debugForcePause(factory, cell);
    const pausedScore = scoreFactory(factory, cell, recipe, false);
    const forecastScore = scoreFactory(factory, cell, recipe, true);
    expect(pausedScore.finalScore).toBe(0);
    expect(Number.isFinite(forecastScore.finalScore)).toBe(true);
    debugForceReopen(factory, cell);
    expect(factory.status).toBe('recovering');
  });

  it('7. hysteresis prevents reopen below threshold', () => {
    const sim = new LivingTradeSimulator(true);
    const cell = yard(sim);
    const factory = sailFactory(sim);
    forceUnprofitable(cell, 'sailcloth');
    debugForcePause(factory, cell);
    factory.profitableTicks = 10;
    factory.adaptationCooldown = 0;
    const recipe = recipeForOutput('sailcloth')!;
    const score = scoreFactory(factory, cell, recipe);
    if (score.finalScore < ADAPTIVE_ECONOMY.reopenThreshold) {
      updateFactoryAgent(factory, cell);
      expect(factory.status).toBe('paused');
    }
  });

  it('8. adaptation cooldown blocks rapid decisions', () => {
    const sim = new LivingTradeSimulator(true);
    const cell = yard(sim);
    const factory = sailFactory(sim);
    factory.adaptationCooldown = 3;
    factory.unprofitableTicks = 10;
    const before = factory.outputScale;
    updateFactoryAgent(factory, cell);
    expect(factory.outputScale).toBe(before);
  });

  it('9. output scale stays within bounds', () => {
    const sim = new LivingTradeSimulator(true);
    for (const f of sim.factories) {
      expect(f.outputScale).toBeGreaterThanOrEqual(0);
      expect(f.outputScale).toBeLessThanOrEqual(ADAPTIVE_ECONOMY.scaleMax + 0.01);
    }
  });

  it('10. layoff increases unemployment', () => {
    const sim = new LivingTradeSimulator(true);
    const cell = yard(sim);
    const factory = sailFactory(sim);
    const before = cell.unemployment;
    factory.workforceAssigned = 3;
    factory.adaptationCooldown = 0;
    factory.unprofitableTicks = ADAPTIVE_ECONOMY.unprofitableTicksToPause;
    factory.outputScale = ADAPTIVE_ECONOMY.scaleMin;
    forceUnprofitable(cell, 'sailcloth');
    updateFactoryAgent(factory, cell);
    expect(cell.unemployment).toBeGreaterThan(before);
  });

  it('11. respects reserve stock when producing', () => {
    const sim = new LivingTradeSimulator(true);
    const cell = yard(sim);
    const recipe = recipeForOutput('sailcloth')!;
    cell.commodities.hardwood!.stock = 5;
    expect(canProduceRecipeScaled(cell, recipe, 1)).toBe(false);
  });

  it('12. runProduction uses factory output scale', () => {
    const sim = new LivingTradeSimulator(true);
    const cell = yard(sim);
    const factory = sailFactory(sim);
    const before = cell.commodities.sailcloth!.stock;
    factory.outputScale = 0.5;
    factory.status = 'operating';
    const log: import('../types').EconomyLogEntry[] = [];
    runProduction(cell, log, [...sim.factories]);
    const after = cell.commodities.sailcloth!.stock;
    expect(after - before).toBeLessThanOrEqual(1);
  });

  it('13. recipe switch requires margin', () => {
    const sim = new LivingTradeSimulator(true);
    const cell = yard(sim);
    const factory = sailFactory(sim);
    factory.recipeSwitchCooldown = 0;
    factory.adaptationCooldown = 0;
    const best = evaluateBestRecipe(factory, cell);
    const current = scoreFactory(factory, cell, recipeForOutput(factory.activeRecipeId)!);
    if (best.score.finalScore <= current.finalScore * ADAPTIVE_ECONOMY.recipeSwitchMargin) {
      const event = updateFactoryAgent(factory, cell);
      expect(event?.type).not.toBe('FACTORY_RECIPE_SWITCHED');
    }
  });

  it('14. save migration v3 includes factories', () => {
    const world = createFreshWorld();
    expect(world.factories.length).toBeGreaterThan(0);
    world.factories = [];
    ensureFactoryAgents(world);
    expect(world.factories.length).toBeGreaterThan(0);
  });

  it('15. updateAdaptiveEconomy runs without error', () => {
    const sim = new LivingTradeSimulator(true);
    const events = updateAdaptiveEconomy(sim.state);
    expect(Array.isArray(events)).toBe(true);
  });

  it('16. profitable ticks can expand when workforce available', () => {
    const sim = new LivingTradeSimulator(true);
    const cell = yard(sim);
    const factory = sailFactory(sim);
    factory.alternativeRecipeIds = [];
    cell.unemployment = 5;
    cell.availableWorkforce = 0;
    forceProfitable(cell, 'sailcloth');
    factory.profitableTicks = ADAPTIVE_ECONOMY.profitableTicksToExpand;
    factory.adaptationCooldown = 0;
    factory.outputScale = 1;
    updateFactoryAgent(factory, cell);
    expect(['expanding', 'operating', 'recovering']).toContain(factory.status);
  });

  it('17. oversupply lowers factory score', () => {
    const sim = new LivingTradeSimulator(true);
    const cell = yard(sim);
    const factory = sailFactory(sim);
    const out = cell.commodities.sailcloth!;
    out.stock = out.targetStock * 3;
    const score = scoreFactory(factory, cell, recipeForOutput('sailcloth')!);
    expect(score.oversupplyPenalty).toBeGreaterThan(0);
  });

  it('18. debug force pause and reopen', () => {
    const sim = new LivingTradeSimulator(true);
    const cell = yard(sim);
    const factory = sailFactory(sim);
    debugForcePause(factory, cell);
    expect(factory.status).toBe('paused');
    debugForceReopen(factory, cell);
    expect(factory.status).toBe('recovering');
  });

  it('19. default agent starts operating at scale 1', () => {
    const sim = new LivingTradeSimulator(true);
    const cell = yard(sim);
    const agent = createDefaultAgent(cell, 'sailcloth');
    expect(agent.status).toBe('operating');
    expect(agent.outputScale).toBe(1);
  });

  it('20. city procurement reopens a primary production line when stock is low', () => {
    const sim = new LivingTradeSimulator(true);
    const cell = yard(sim);
    const factory = sailFactory(sim);
    const output = cell.commodities.sailcloth!;
    output.stock = 0;
    output.currentPrice = 1;
    output.memory.averagePrice = 1;
    for (const inputId of Object.keys(recipeForOutput('sailcloth')!.inputs)) {
      const input = cell.commodities[inputId as keyof typeof cell.commodities];
      if (!input) continue;
      input.stock = input.targetStock * 2;
      input.currentPrice = input.basePrice * 3;
      input.memory.averagePrice = input.basePrice * 3;
    }

    const score = scoreFactory(factory, cell, recipeForOutput('sailcloth')!);
    expect(score.reasons).toContain('คำสั่งซื้อฟื้นฟูการผลิต');
    expect(score.finalScore).toBeGreaterThan(ADAPTIVE_ECONOMY.reopenThreshold);
  });

  it('21. long simulation keeps every supply chain alive (1000 ticks)', async () => {
    const sim = new LivingTradeSimulator(true);
    await runTicksCooperatively(sim, 1000);
    for (const cell of sim.state.cells) {
      for (const [commodityId, item] of Object.entries(cell.commodities)) {
        if (!item) continue;
        expect(Number.isFinite(item.stock)).toBe(true);
        expect(item.stock).toBeGreaterThan(0);
        expect(item.marketState).not.toBe('collapsed');
        const model = LIVING_COMMODITY_META[
          commodityId as keyof typeof LIVING_COMMODITY_META
        ].consumptionModel;
        // ของหายาก/ของหรูขาดได้เพื่อสร้างโอกาสทำกำไร แต่เสบียงและสายโรงงานต้องไม่วิกฤต
        if (model !== 'trade-good' && model !== 'luxury') {
          expect(item.marketState).not.toBe('crisis');
        }
      }
      expect(Number.isFinite(cell.unemployment)).toBe(true);
      expect(cell.unemployment).toBeGreaterThanOrEqual(0);
    }
    for (const f of sim.factories) {
      expect(Number.isFinite(f.outputScale)).toBe(true);
      expect(Number.isFinite(f.profitEma)).toBe(true);
    }
  }, 120_000);
});
