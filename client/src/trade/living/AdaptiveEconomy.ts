import type { EconomyLogEntry, EconomyWorldState, FactoryEvent } from './types';
import {
  createFactoryAgentsForCell,
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

    const existing = new Set(
      world.factories.filter((f) => f.cellId === cell.id).map((f) => f.recipeId),
    );
    for (const recipe of recipesForCell(cell.id)) {
      if (recipeMeta(recipe.id).requiredWorkers <= 0) continue;
      if (!existing.has(recipe.id)) {
        world.factories.push(...createFactoryAgentsForCell(cell).filter((a) => a.recipeId === recipe.id));
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
