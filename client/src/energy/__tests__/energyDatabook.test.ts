import { describe, expect, it } from 'vitest';
import {
  ENERGY_DRAIN_EXCEPTIONS,
  ENERGY_SYSTEM_CONFIG,
  MAX_ENERGY_SCENARIOS,
} from '../databook';
import {
  canAffordEnergyCost,
  dashEnergyCost,
  energyRegenRateMultiplier,
  lowEnergyMessage,
  maxEnergyFromMelee,
  totalMaxEnergy,
} from '../EnergyFormulas';
import { getMaxEnergyScenario } from '../EnergyRegistry';

describe('Energy databook', () => {
  it('defines core energy config from wiki', () => {
    expect(ENERGY_SYSTEM_CONFIG.startingEnergy).toBe(100);
    expect(ENERGY_SYSTEM_CONFIG.maxEnergyBase).toBe(14_095);
    expect(ENERGY_SYSTEM_CONFIG.dashEnergyCost).toBe(30);
  });

  it('uses melee energy formula 5(S+19)', () => {
    expect(maxEnergyFromMelee(1)).toBe(100);
    expect(maxEnergyFromMelee(2800)).toBe(14_095);
  });

  it('lists max energy scenarios from trivia', () => {
    expect(MAX_ENERGY_SCENARIOS).toHaveLength(3);
    expect(getMaxEnergyScenario('kitsune-ribbon')?.totalEnergy).toBe(16_595);
    expect(getMaxEnergyScenario('kitsune-ribbon-awakened-race')?.totalEnergy).toBe(18_180);
  });

  it('adds bonus energy to melee-based max', () => {
    expect(totalMaxEnergy(2800, 2500)).toBe(16_595);
  });

  it('handles dash costs and rabbit race', () => {
    expect(dashEnergyCost()).toBe(30);
    expect(dashEnergyCost('rabbit')).toBe(15);
  });

  it('blocks moves when energy is too low', () => {
    expect(canAffordEnergyCost(20, 30)).toBe(false);
    expect(canAffordEnergyCost(30, 30)).toBe(true);
    expect(lowEnergyMessage(50)).toContain('50');
  });

  it('doubles regen on ground', () => {
    expect(energyRegenRateMultiplier(true)).toBe(2);
    expect(energyRegenRateMultiplier(false)).toBe(1);
  });

  it('lists m1 drain exceptions', () => {
    expect(ENERGY_DRAIN_EXCEPTIONS.length).toBeGreaterThanOrEqual(5);
    expect(ENERGY_DRAIN_EXCEPTIONS.some((e) => e.id === 'rubber')).toBe(true);
  });
});
