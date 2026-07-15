import { describe, expect, it } from 'vitest';
import { LivingTradeSimulator } from '../LivingTradeSimulator';
import { LIVING_ECONOMY_BOUNDS } from '../LivingEconomyBounds';
import { ECONOMY_GENOME_CONFIG } from '../EconomyGenomeConfig';
import { saveEconomyState, loadEconomyState } from '../LivingTradePersistence';
import { PLAYER_REPUTATION_CONFIG } from '../PlayerReputationConfig';
import { yieldToTestRunner } from './soakTestUtils';

describe('Living Economy Core v1.0 — extended 20k soak', () => {
  it('20,000 ticks remain stable with bounded collections', async () => {
    const sim = new LivingTradeSimulator(true);
    let identityShifts = 0;
    const shiftByCell = new Map<string, number>();

    for (let i = 0; i < 20_000; i++) {
      if (i > 0 && i % 5000 === 0 && typeof localStorage !== 'undefined') {
        saveEconomyState(sim.state);
        const loaded = loadEconomyState();
        expect(loaded?.tick).toBe(sim.state.tick);
      }

      for (const g of sim.state.genomeState!.genomes) {
        const prev = shiftByCell.get(g.cellId) ?? g.identity.genomeGeneration;
        if (g.identity.genomeGeneration > prev) {
          identityShifts += 1;
          shiftByCell.set(g.cellId, g.identity.genomeGeneration);
        }
      }

      sim.tick();
      await yieldToTestRunner(i);
    }

    const world = sim.state;
    expect(world.tick).toBe(20_000);
    expect(world.log.length).toBeLessThanOrEqual(LIVING_ECONOMY_BOUNDS.maxEconomyLogEntries);
    expect(world.news.length).toBeLessThanOrEqual(LIVING_ECONOMY_BOUNDS.maxNewsEntries);
    expect(world.genomeState!.genomePressures.length)
      .toBeLessThanOrEqual(ECONOMY_GENOME_CONFIG.maximumPressureLogSamples);
    expect(world.genomeState!.evolutionHistory.length)
      .toBeLessThanOrEqual(ECONOMY_GENOME_CONFIG.maximumEvolutionHistoryEntries);

    for (const cell of world.cells) {
      expect(cell.unemployment).toBeGreaterThanOrEqual(0);
      expect(cell.availableWorkforce).toBeGreaterThanOrEqual(0);
      for (const item of Object.values(cell.commodities)) {
        if (!item) continue;
        expect(Number.isFinite(item.stock)).toBe(true);
        expect(item.stock).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(item.currentPrice)).toBe(true);
      }
    }

    for (const r of world.reservations) {
      expect(r.amount).toBeGreaterThanOrEqual(0);
    }

    for (const g of world.genomeState!.genomes) {
      expect(g.storagePreference).toBeGreaterThanOrEqual(0);
      expect(g.storagePreference).toBeLessThanOrEqual(1);
      expect(Number.isFinite(g.fitness.emaScore)).toBe(true);
    }

    expect(identityShifts).toBeLessThan(80);
    expect(world.factories.length).toBeGreaterThan(0);
    expect(world.traderProfiles.length).toBeGreaterThan(0);
    expect(world.orders.some((o) => o.status === 'completed' || o.status === 'open')).toBe(true);

    const pe = world.playerEconomy!;
    expect(pe.tradeHistory.length).toBeLessThanOrEqual(PLAYER_REPUTATION_CONFIG.maxSavedPlayerTradeHistory);
  }, 600_000);
});
