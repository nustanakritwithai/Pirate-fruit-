import type { EconomyLogEntry, EconomyWorldState, FactoryEvent } from './types';
import {
  createFactoryAgentsForCell,
  createDefaultAgent,
  factoryUnitsForCell,
  factoryEventsToLog,
  initCellWorkforce,
  updateFactoryAgent,
} from './FactoryAgent';
import { recipesForCell } from './ProductionRecipes';
import { recipeMeta } from './FactoryRecipeMeta';

/** สร้างหรือซ่อม factory agents สำหรับโลก */
export function ensureFactoryAgents(world: EconomyWorldState): void {
  if (!world.factories?.length) {
    world.factories = [];
    for (const cell of world.cells) {
      const agents = createFactoryAgentsForCell(cell);
      world.factories.push(...agents);
      initCellWorkforce(cell, world.factories);
    }
    return;
  }

  for (const cell of world.cells) {
    cell.availableWorkforce ??= 0;
    cell.unemployment ??= 0;
    cell.wageLevel ??= 10;

    for (const recipe of recipesForCell(cell.id)) {
      if (recipeMeta(recipe.id).requiredWorkers <= 0) continue;
      const existingCount = world.factories.filter(
        (f) => f.cellId === cell.id && f.recipeId === recipe.id,
      ).length;
      const desiredCount = factoryUnitsForCell(cell.id);
      for (let unitIndex = existingCount + 1; unitIndex <= desiredCount; unitIndex++) {
        world.factories.push(createDefaultAgent(cell, recipe.id, unitIndex));
      }
    }
  }
}

/** ประเมินและตัดสินใจทุกโรงงาน — เรียกก่อน runProduction */
export function updateAdaptiveEconomy(world: EconomyWorldState): FactoryEvent[] {
  ensureFactoryAgents(world);
  const events: FactoryEvent[] = [];

  for (const factory of world.factories) {
    const cell = world.cells.find((c) => c.id === factory.cellId);
    if (!cell) continue;
    const event = updateFactoryAgent(factory, cell, world);
    if (event) events.push(event);
  }

  return events;
}

export function appendFactoryEventsToLog(
  events: FactoryEvent[],
  log: EconomyLogEntry[],
  tick: number,
): void {
  log.push(...factoryEventsToLog(events, tick));
}
