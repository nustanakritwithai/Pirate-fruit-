import { describe, expect, it, beforeEach } from 'vitest';
import {
  canProduceRecipe,
  getFoodSecurity,
  getToolEfficiency,
  getWealth,
  produceGoods,
  runProduction,
  updateDemand,
  updateWorldModifiers,
  resolveSpoilage,
} from '../EconomyRules';
import { LivingTradeSimulator } from '../LivingTradeSimulator';
import { PRODUCTION_RECIPES, recipeForOutput } from '../ProductionRecipes';
import { createFreshWorld } from '../LivingTradePersistence';
import { ECONOMY_CONFIG } from '../LivingTradeConfig';
import type { EconomyCellState } from '../types';

function freshSim(): LivingTradeSimulator {
  return new LivingTradeSimulator(true);
}

function leafCell(sim: LivingTradeSimulator): EconomyCellState {
  return sim.getCell('leaf-island')!;
}

function mineCell(sim: LivingTradeSimulator): EconomyCellState {
  return sim.getCell('mine-island')!;
}

function clothCell(sim: LivingTradeSimulator): EconomyCellState {
  return sim.getCell('cloth-island')!;
}

function yardCell(sim: LivingTradeSimulator): EconomyCellState {
  return sim.getCell('shipyard-island')!;
}

describe('Phase T4A — Production chains', () => {
  let sim: LivingTradeSimulator;

  beforeEach(() => {
    sim = freshSim();
  });

  it('1. fresh fish is processed into dried fish', () => {
    const leaf = leafCell(sim);
    leaf.commodities['fresh-fish']!.stock = 50;
    leaf.commodities['dried-fish']!.stock = 0;
    const before = leaf.commodities['dried-fish']!.stock;
    runProduction(leaf, []);
    expect(leaf.commodities['dried-fish']!.stock).toBeGreaterThan(before);
    expect(leaf.commodities['fresh-fish']!.stock).toBeLessThan(50);
  });

  it('2. dried fish is not produced when fresh fish is insufficient', () => {
    const leaf = leafCell(sim);
    leaf.commodities['fresh-fish']!.stock = 2;
    leaf.commodities['dried-fish']!.stock = 0;
    runProduction(leaf, []);
    expect(leaf.commodities['dried-fish']!.stock).toBe(0);
  });

  it('3. iron ore is processed into iron ingots', () => {
    const mine = mineCell(sim);
    mine.commodities['iron-ore']!.stock = 30;
    mine.commodities['iron-ingot']!.stock = 0;
    runProduction(mine, []);
    expect(mine.commodities['iron-ingot']!.stock).toBeGreaterThan(0);
  });

  it('4. tools consume ingots and hardwood correctly', () => {
    const mine = mineCell(sim);
    mine.commodities['iron-ore']!.stock = 0;
    mine.commodities['healing-herb']!.stock = 0;
    mine.commodities['herbal-medicine']!.stock = mine.commodities['herbal-medicine']!.targetStock * 2;
    mine.commodities['iron-ingot']!.stock = 30;
    mine.commodities.hardwood!.stock = 30;
    mine.commodities.tools!.stock = 0;
    runProduction(mine, []);
    expect(mine.commodities.tools!.stock).toBeGreaterThan(0);
    expect(mine.commodities['iron-ingot']!.stock).toBeLessThan(30);
    expect(mine.commodities.hardwood!.stock).toBeLessThan(30);
  });

  it('5. rope uses sun silk correctly', () => {
    const cloth = clothCell(sim);
    cloth.commodities['sun-silk']!.stock = 20;
    cloth.commodities.rope!.stock = 0;
    runProduction(cloth, []);
    expect(cloth.commodities.rope!.stock).toBeGreaterThan(0);
    expect(cloth.commodities['sun-silk']!.stock).toBeLessThan(20);
  });

  it('6. ship parts use mid-tier inputs not raw ore', () => {
    const yard = yardCell(sim);
    const recipe = recipeForOutput('sailcloth')!;
    expect(recipe.inputs['iron-ore']).toBeUndefined();
    expect(recipe.inputs['iron-ingot']).toBe(2);
    expect(recipe.inputs.rope).toBe(2);
    yard.commodities.hardwood!.stock = 40;
    yard.commodities['iron-ingot']!.stock = 30;
    yard.commodities.rope!.stock = 10;
    yard.commodities.tools!.stock = yard.commodities.tools!.targetStock * 2;
    yard.commodities['repair-kit']!.stock = yard.commodities['repair-kit']!.targetStock * 2;
    yard.commodities['trade-crate']!.stock = yard.commodities['trade-crate']!.targetStock * 2;
    yard.commodities.sailcloth!.stock = 0;
    runProduction(yard, []);
    expect(yard.commodities.sailcloth!.stock).toBeGreaterThan(0);
  });

  it('7. factory stops when output is overstocked', () => {
    const leaf = leafCell(sim);
    const dried = leaf.commodities['dried-fish']!;
    dried.stock = dried.targetStock * 1.5;
    leaf.commodities['fresh-fish']!.stock = 100;
    const recipe = PRODUCTION_RECIPES.find((r) => r.id === 'dried-fish')!;
    expect(canProduceRecipe(leaf, recipe)).toBe(false);
  });

  it('8. factory respects reserve stock on inputs', () => {
    const yard = yardCell(sim);
    yard.commodities.hardwood!.stock = 12;
    const recipe = recipeForOutput('sailcloth')!;
    expect(canProduceRecipe(yard, recipe)).toBe(false);
  });

  it('9. sufficient tools boost production efficiency', () => {
    const mine = mineCell(sim);
    mine.commodities.tools!.stock = mine.commodities.tools!.targetStock;
    expect(getToolEfficiency(mine)).toBe(1.2);
    const ore = mine.commodities['iron-ore']!;
    ore.stock = 50;
    ore.production = 10;
    const before = ore.stock;
    produceGoods(mine);
    expect(ore.stock - before).toBeGreaterThan(10);
  });

  it('10. tool shortage reduces production efficiency', () => {
    const mine = mineCell(sim);
    mine.commodities.tools!.stock = 1;
    mine.commodities.tools!.targetStock = 30;
    expect(getToolEfficiency(mine)).toBe(0.75);
  });

  it('11. ship parts surplus increases NPC cargo capacity multiplier', () => {
    const world = createFreshWorld();
    const yard = world.cells.find((c) => c.id === 'shipyard-island')!;
    yard.commodities.sailcloth!.stock = yard.commodities.sailcloth!.targetStock * 1.5;
    updateWorldModifiers(world);
    expect(world.npcCargoCapacityMultiplier).toBe(1.2);
  });

  it('12. trade crates reduce spoilage rate', () => {
    const world = createFreshWorld();
    const leaf = world.cells.find((c) => c.id === 'leaf-island')!;
    leaf.commodities['trade-crate']!.stock = leaf.commodities['trade-crate']!.targetStock;
    updateWorldModifiers(world);
    expect(world.spoilageReduction).toBe(0.5);

    const fish = leaf.commodities['fresh-fish']!;
    fish.stock = fish.targetStock * 2;
    const before = fish.stock;
    resolveSpoilage(leaf, [], world.spoilageReduction);
    const loss = before - fish.stock;
    const fullLoss = Math.floor(before * ECONOMY_CONFIG.spoilageRate);
    expect(loss).toBeLessThan(fullLoss);
  });

  it('13. luxury cloth has low demand during food crisis', () => {
    const cloth = clothCell(sim);
    cloth.commodities['fresh-fish']!.stock = 0;
    cloth.commodities['dried-fish']!.stock = 0;
    expect(getFoodSecurity(cloth)).toBeLessThan(40);
    updateDemand(cloth);
    expect(cloth.commodities['luxury-cloth']!.demand).toBe(10);
  });

  it('14. luxury cloth has high demand when wealth is high', () => {
    const cloth = clothCell(sim);
    cloth.commodities['sun-silk']!.stock = cloth.commodities['sun-silk']!.targetStock * 1.5;
    cloth.commodities['luxury-cloth']!.stock = cloth.commodities['luxury-cloth']!.targetStock;
    cloth.commodities['fresh-fish']!.stock = 200;
    expect(getWealth(cloth)).toBeGreaterThan(70);
    updateDemand(cloth);
    expect(cloth.commodities['luxury-cloth']!.demand).toBe(90);
  });

  it('15. input prices rise when factories lack mid-tier goods', () => {
    sim.injectShortage('shipyard-island', 'iron-ingot', 40);
    const ingot = sim.getCommodity('shipyard-island', 'iron-ingot')!;
    expect(ingot.currentPrice).toBeGreaterThan(ingot.basePrice * 0.9);
  });

  it('16. overstocked outputs reduce pressure on inputs over ticks', () => {
    const leaf = leafCell(sim);
    leaf.commodities['dried-fish']!.stock = leaf.commodities['dried-fish']!.targetStock * 2;
    const recipe = recipeForOutput('dried-fish')!;
    expect(canProduceRecipe(leaf, recipe)).toBe(false);
  });

  it('17. fresh world includes all production chain commodities', () => {
    const world = createFreshWorld();
    expect(world.cells[0].commodities['dried-fish']).toBeDefined();
    expect(world.cells[1].commodities['iron-ingot']).toBeDefined();
    expect(world.cells[2].commodities['luxury-cloth']).toBeDefined();
    expect(world.npcCargoCapacityMultiplier).toBe(1);
    expect(world.spoilageReduction).toBe(0);
  });

  it('18. herbal medicine is produced from healing herbs', () => {
    const mine = mineCell(sim);
    mine.commodities['healing-herb']!.stock = 20;
    mine.commodities['herbal-medicine']!.stock = 0;
    runProduction(mine, []);
    expect(mine.commodities['herbal-medicine']!.stock).toBeGreaterThan(0);
  });
});

describe('LivingTradeSimulator — ship parts (updated recipe)', () => {
  it('4. missing mid-tier inputs stop ship parts production', () => {
    const sim = new LivingTradeSimulator(true);
    const yard = sim.getCell('shipyard-island')!;
    yard.commodities.hardwood!.stock = 0;
    yard.commodities['iron-ingot']!.stock = 0;
    yard.commodities.rope!.stock = 0;
    const partsBefore = yard.commodities.sailcloth!.stock;
    sim.tickMany(8);
    const sailAgent = sim.factories.find(
      (f) => f.cellId === 'shipyard-island' && f.activeRecipeId === 'sailcloth',
    );
    expect(yard.commodities.sailcloth!.stock).toBeLessThanOrEqual(partsBefore + 1);
    const stopped =
      sailAgent?.status === 'paused'
      || sailAgent?.status === 'reducing'
      || (sailAgent?.lastReasons.some((r) => r.includes('ขาด')) ?? false)
      || sim.log.some((l) => l.message.includes('หยุด') || l.message.includes('ขาด'));
    expect(stopped).toBe(true);
  });
});
