import { LIVING_COMMODITY_IDS, CELL_TO_GAME_ISLAND } from './LivingTradeConfig';
import { stockRatio } from './LivingTradeFormulas';
import { addPressure } from './GenomePressureStore';
import { ensureGenomeState } from './EconomyGenomeInitializer';
import type { EconomyWorldState, EconomyCellId } from './types';

function norm(v: number, max = 1): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-1, Math.min(1, v / max));
}

function collectFactoryPressures(world: EconomyWorldState, cellId: EconomyCellId): void {
  const cell = world.cells.find((c) => c.id === cellId);
  if (!cell) return;

  for (const factory of world.factories.filter((f) => f.cellId === cellId)) {
    const recipeId = factory.activeRecipeId;
    const profitNorm = norm(factory.profitEma, 50);
    const scale = factory.outputScale;

    if (factory.status === 'operating' || factory.status === 'expanding') {
      if (profitNorm > 0.05) {
        addPressure(world, {
          cellId,
          source: 'factory',
          target: 'production-bias',
          commodityId: recipeId,
          strength: profitNorm * scale * 0.08,
          sourceReferenceId: factory.id,
        });
        if (profitNorm > 0.2) {
          addPressure(world, {
            cellId,
            source: 'factory',
            target: 'industrialization',
            strength: profitNorm * 0.03,
            sourceReferenceId: factory.id,
          });
        }
      }
    }

    if (factory.status === 'paused' || factory.unprofitableTicks > 5) {
      addPressure(world, {
        cellId,
        source: 'factory',
        target: 'production-bias',
        commodityId: recipeId,
        strength: -0.06 * Math.min(1, factory.unprofitableTicks / 10),
        sourceReferenceId: factory.id,
      });
    }
  }
}

function collectTraderPressures(world: EconomyWorldState, cellId: EconomyCellId): void {
  for (const mem of world.traderRouteMemories ?? []) {
    if (mem.sourceIslandId !== cellId && mem.destinationIslandId !== cellId) continue;
    const profitNorm = norm(mem.profitEma, 40);
    if (profitNorm <= 0) continue;
    addPressure(world, {
      cellId,
      source: 'trader',
      target: 'trade-preference',
      strength: profitNorm * 0.05,
      sourceReferenceId: mem.key,
    });
    addPressure(world, {
      cellId,
      source: 'trader',
      target: 'production-bias',
      commodityId: mem.commodityId,
      strength: profitNorm * 0.03,
      sourceReferenceId: mem.key,
    });
  }

  for (const order of world.orders) {
    if (order.sourceIslandId !== cellId && order.destinationIslandId !== cellId) continue;
    if (order.status !== 'completed' && order.status !== 'in-transit') continue;
    addPressure(world, {
      cellId,
      source: 'trader',
      target: 'trade-preference',
      strength: 0.02,
      sourceReferenceId: order.id,
    });
  }
}

function collectPlayerPressures(world: EconomyWorldState, cellId: EconomyCellId): void {
  const pe = world.playerEconomy;
  if (!pe) return;

  const gameIsland = CELL_TO_GAME_ISLAND[cellId];

  for (const entry of pe.tradeHistory.slice(0, 20)) {
    if (entry.islandId !== gameIsland) continue;
    const vol = norm(entry.amount, 30);
    if (entry.type === 'buy') {
      addPressure(world, {
        cellId,
        source: 'player',
        target: 'production-bias',
        commodityId: entry.commodityId,
        strength: vol * 0.06,
      });
      addPressure(world, {
        cellId,
        source: 'player',
        target: 'storage-preference',
        strength: vol * 0.02,
      });
    } else {
      if (entry.impact === 'resolved-crisis' || entry.impact === 'resolved-shortage') {
        addPressure(world, {
          cellId,
          source: 'player',
          target: 'consumption-bias',
          commodityId: entry.commodityId,
          strength: vol * 0.08,
        });
      }
      if (entry.impact === 'market-dump') {
        addPressure(world, {
          cellId,
          source: 'player',
          target: 'production-bias',
          commodityId: entry.commodityId,
          strength: -vol * 0.05,
        });
      }
    }
  }
}

function collectMarketPressures(world: EconomyWorldState, cellId: EconomyCellId): void {
  const cell = world.cells.find((c) => c.id === cellId);
  if (!cell) return;

  for (const id of LIVING_COMMODITY_IDS) {
    const item = cell.commodities[id];
    if (!item) continue;
    const ratio = stockRatio(item, world, cellId);

    if (item.marketState === 'shortage' || item.marketState === 'crisis') {
      const depth = norm(1 - ratio, 1);
      addPressure(world, {
        cellId,
        source: 'market',
        target: 'storage-preference',
        strength: depth * 0.04,
        commodityId: id,
      });
      addPressure(world, {
        cellId,
        source: 'market',
        target: 'production-bias',
        commodityId: id,
        strength: depth * 0.03,
      });
    }

    if (item.marketState === 'surplus') {
      addPressure(world, {
        cellId,
        source: 'market',
        target: 'production-bias',
        commodityId: id,
        strength: -0.02,
      });
    }
  }
}

export function collectGenomePressures(world: EconomyWorldState): void {
  ensureGenomeState(world);
  if (world.genomeState!.genomeDebug.freezePressureCollection) return;

  for (const cell of world.cells) {
    collectFactoryPressures(world, cell.id);
    collectTraderPressures(world, cell.id);
    collectPlayerPressures(world, cell.id);
    collectMarketPressures(world, cell.id);
  }
}
