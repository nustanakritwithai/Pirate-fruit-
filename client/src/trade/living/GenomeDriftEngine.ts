import { ECONOMY_GENOME_CONFIG } from './EconomyGenomeConfig';
import { clampGenome, clampVelocity, getGenome, ensureGenomeState } from './EconomyGenomeInitializer';
import {
  getPressuresForCell,
  sumPressureForTarget,
} from './GenomePressureStore';
import { LIVING_COMMODITY_IDS } from './LivingTradeConfig';
import type { EconomyWorldState, LivingCommodityId } from './types';
import type { GenomePressureTarget } from './EconomyGenomeTypes';

function fitnessMultiplier(emaScore: number, positive: boolean): number {
  const cfg = ECONOMY_GENOME_CONFIG;
  if (positive) {
    return cfg.fitnessMultiplierBase + emaScore * cfg.fitnessMultiplierScale;
  }
  return cfg.negativePressureBase - emaScore * cfg.negativePressureFitnessScale;
}

function effectivePressure(raw: number, emaScore: number): number {
  if (Math.abs(raw) < ECONOMY_GENOME_CONFIG.pressureDeadZone) return 0;
  const positive = raw > 0;
  return raw * fitnessMultiplier(emaScore, positive);
}

function applyScalarDrift(
  current: number,
  velocity: number,
  pressure: number,
  emaScore: number,
  accel: number,
): { value: number; velocity: number } {
  const cfg = ECONOMY_GENOME_CONFIG;
  const eff = effectivePressure(pressure, emaScore) * accel;
  let vel = velocity * cfg.velocityInertia + eff * cfg.pressureAcceleration;
  vel = clampVelocity(vel);
  if (Math.abs(eff) < cfg.pressureDeadZone) {
    vel *= 0.85;
  }
  const value = clampGenome(current + vel * cfg.baseDriftRate);
  return { value, velocity: vel };
}

function driftCommodityBias(
  biases: Partial<Record<LivingCommodityId, number>>,
  velocities: Partial<Record<LivingCommodityId, number>>,
  pressures: ReturnType<typeof getPressuresForCell>,
  target: GenomePressureTarget,
  emaScore: number,
  accel: number,
): void {
  for (const id of LIVING_COMMODITY_IDS) {
    const raw = sumPressureForTarget(pressures, target, id);
    const eff = effectivePressure(raw, emaScore) * accel;
    const cfg = ECONOMY_GENOME_CONFIG;
    let vel = (velocities[id] ?? 0) * cfg.velocityInertia + eff * cfg.pressureAcceleration;
    vel = clampVelocity(vel);
    if (Math.abs(eff) < cfg.pressureDeadZone) vel *= 0.85;
    velocities[id] = vel;
    biases[id] = clampGenome((biases[id] ?? 0.5) + vel * cfg.baseDriftRate);
  }
}

export function driftGenome(world: EconomyWorldState, cellId: import('./types').EconomyCellId): void {
  const genome = getGenome(world, cellId);
  const pressures = getPressuresForCell(world, cellId);
  const ema = genome.fitness.emaScore;
  const accel = world.genomeState?.genomeDebug.accelMultiplier ?? 1;

  driftCommodityBias(
    genome.productionBias,
    genome.productionVelocity,
    pressures,
    'production-bias',
    ema,
    accel,
  );
  driftCommodityBias(
    genome.consumptionBias,
    genome.consumptionVelocity,
    pressures,
    'consumption-bias',
    ema,
    accel,
  );

  const scalarTargets: Array<{
    key: keyof typeof genome.scalarVelocity;
    target: GenomePressureTarget;
    get: () => number;
    set: (v: number) => void;
  }> = [
    { key: 'storagePreference', target: 'storage-preference', get: () => genome.storagePreference, set: (v) => { genome.storagePreference = v; } },
    { key: 'riskTolerance', target: 'risk-tolerance', get: () => genome.riskTolerance, set: (v) => { genome.riskTolerance = v; } },
    { key: 'tradePreference', target: 'trade-preference', get: () => genome.tradePreference, set: (v) => { genome.tradePreference = v; } },
    { key: 'industrialization', target: 'industrialization', get: () => genome.industrialization, set: (v) => { genome.industrialization = v; } },
    { key: 'urbanization', target: 'urbanization', get: () => genome.urbanization, set: (v) => { genome.urbanization = v; } },
    { key: 'technology', target: 'technology', get: () => genome.technology, set: (v) => { genome.technology = v; } },
    { key: 'populationGrowth', target: 'population-growth', get: () => genome.populationGrowth, set: (v) => { genome.populationGrowth = v; } },
    { key: 'wealthRetention', target: 'wealth-retention', get: () => genome.wealthRetention, set: (v) => { genome.wealthRetention = v; } },
  ];

  for (const s of scalarTargets) {
    const raw = sumPressureForTarget(pressures, s.target);
    const result = applyScalarDrift(
      s.get(),
      genome.scalarVelocity[s.key],
      raw,
      ema,
      accel,
    );
    s.set(result.value);
    genome.scalarVelocity[s.key] = result.velocity;
  }

  genome.lastDriftTick = world.tick;
  genome.driftCycleCount += 1;
}

export function driftAllGenomes(world: EconomyWorldState): void {
  ensureGenomeState(world);
  if (world.genomeState!.genomeDebug.freezeDrift) return;
  for (const cell of world.cells) {
    driftGenome(world, cell.id);
  }
  world.genomeState!.lastDriftTick = world.tick;
}

export function shouldDriftGenomes(world: EconomyWorldState): boolean {
  ensureGenomeState(world);
  const interval = ECONOMY_GENOME_CONFIG.genomeDriftIntervalTicks;
  return world.tick - world.genomeState!.lastDriftTick >= interval
    || world.genomeState!.lastDriftTick === 0;
}
