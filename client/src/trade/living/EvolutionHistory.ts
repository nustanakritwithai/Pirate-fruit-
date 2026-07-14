import { ECONOMY_GENOME_CONFIG } from './EconomyGenomeConfig';
import { ensureGenomeState } from './EconomyGenomeInitializer';
import type { EconomyWorldState, EconomyCellId } from './types';
import type { EvolutionEventType, EvolutionHistoryEntry } from './EconomyGenomeTypes';

let historyCounter = 0;

export function resetEvolutionHistoryCounter(): void {
  historyCounter = 0;
}

export function appendEvolutionEvent(
  world: EconomyWorldState,
  params: Omit<EvolutionHistoryEntry, 'id' | 'tick' | 'day'>,
): void {
  ensureGenomeState(world);
  const gs = world.genomeState!;
  historyCounter += 1;
  const entry: EvolutionHistoryEntry = {
    id: `evo-${historyCounter}`,
    tick: world.tick,
    day: Math.floor(world.tick / ECONOMY_GENOME_CONFIG.ticksPerGameDay),
    ...params,
  };
  gs.evolutionHistory.unshift(entry);
  if (gs.evolutionHistory.length > ECONOMY_GENOME_CONFIG.maximumEvolutionHistoryEntries) {
    gs.evolutionHistory = gs.evolutionHistory.slice(
      0,
      ECONOMY_GENOME_CONFIG.maximumEvolutionHistoryEntries,
    );
  }
}

export function clearEvolutionHistory(world: EconomyWorldState): void {
  ensureGenomeState(world);
  world.genomeState!.evolutionHistory = [];
}

export function getEvolutionHistoryForCell(
  world: EconomyWorldState,
  cellId: EconomyCellId,
): EvolutionHistoryEntry[] {
  ensureGenomeState(world);
  return world.genomeState!.evolutionHistory.filter((e) => e.cellId === cellId);
}

export function recordFitnessEvolutionEvents(world: EconomyWorldState): void {
  for (const genome of world.genomeState?.genomes ?? []) {
    const prev = genome.fitness;
    if (prev.evaluatedTick < world.tick - ECONOMY_GENOME_CONFIG.fitnessEvaluationIntervalTicks) {
      continue;
    }
  }
}

export type { EvolutionEventType };
