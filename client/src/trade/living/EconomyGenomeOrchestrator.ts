import { decayAndPrunePressures } from './GenomePressureStore';
import { collectGenomePressures } from './GenomePressureCollector';
import {
  evaluateAllGenomeFitness,
  shouldEvaluateFitness,
} from './GenomeFitnessEvaluator';
import { driftAllGenomes, shouldDriftGenomes } from './GenomeDriftEngine';
import { resolveAllGenomeIdentities, resolveGenomeIdentity } from './GenomeIdentityResolver';
import { ensureGenomeState } from './EconomyGenomeInitializer';
import type { EconomyWorldState } from './types';

export function updateEconomyGenome(world: EconomyWorldState): void {
  ensureGenomeState(world);

  collectGenomePressures(world);
  decayAndPrunePressures(world);

  if (shouldEvaluateFitness(world)) {
    evaluateAllGenomeFitness(world);
  }

  if (shouldDriftGenomes(world)) {
    driftAllGenomes(world);
    resolveAllGenomeIdentities(world);
  }
}

export function forceEvaluateFitness(world: EconomyWorldState): void {
  ensureGenomeState(world);
  evaluateAllGenomeFitness(world);
}

export function forceDriftGenomes(world: EconomyWorldState): void {
  ensureGenomeState(world);
  const wasFrozen = world.genomeState!.genomeDebug.freezeDrift;
  world.genomeState!.genomeDebug.freezeDrift = false;
  driftAllGenomes(world);
  resolveAllGenomeIdentities(world);
  world.genomeState!.genomeDebug.freezeDrift = wasFrozen;
}

export function forceResolveIdentities(world: EconomyWorldState): void {
  ensureGenomeState(world);
  const wasFrozen = world.genomeState!.genomeDebug.freezeDrift;
  world.genomeState!.genomeDebug.freezeDrift = false;
  for (const cell of world.cells) {
    resolveGenomeIdentity(world, cell.id);
  }
  world.genomeState!.genomeDebug.freezeDrift = wasFrozen;
}
