import { describe, expect, it } from 'vitest';
import {
  DAMAGE_REDUCTION_RULES,
  HEALTH_REGEN_ACCESSORIES,
  HEALTH_SYSTEM_CONFIG,
  MAX_HEALTH_SCENARIOS,
  MOBILITY_HEALTH_SCALING,
  REVIVAL_RULES,
  SURVIVAL_TITLES,
} from '../databook';
import {
  applyAuraDamageReduction,
  healthFraction,
  maxHealthFromDefense,
  mobilitySpeedMultiplier,
  qualifiesForSurvivalTitle,
  totalMaxHealth,
} from '../HealthFormulas';
import {
  getMaxHealthScenario,
  getHealthRegenAccessory,
  listMobilityRulesForFruit,
} from '../HealthRegistry';

describe('Health databook', () => {
  it('defines core health config from wiki', () => {
    expect(HEALTH_SYSTEM_CONFIG.startingHealth).toBe(100);
    expect(HEALTH_SYSTEM_CONFIG.maxHealthBase).toBe(14_095);
    expect(HEALTH_SYSTEM_CONFIG.auraDamageReductionPercent).toBe(0.3);
  });

  it('uses defense health formula 5(S+19)', () => {
    expect(maxHealthFromDefense(1)).toBe(100);
    expect(maxHealthFromDefense(2800)).toBe(14_095);
  });

  it('lists max health scenarios from trivia', () => {
    expect(MAX_HEALTH_SCENARIOS).toHaveLength(4);
    expect(getMaxHealthScenario('leviathan-shield-draco-v3')?.totalHp).toBe(16_762);
    expect(getMaxHealthScenario('leviathan-shield-shark-v4-armor')?.totalHp).toBe(20_733);
  });

  it('adds bonus hp to defense-based max', () => {
    expect(totalMaxHealth(2800, 1000)).toBe(15_095);
  });

  it('applies full body aura 30% damage reduction', () => {
    expect(applyAuraDamageReduction(100, true)).toBe(70);
    expect(applyAuraDamageReduction(100, false)).toBe(100);
    expect(DAMAGE_REDUCTION_RULES[0].reductionPercent).toBe(0.3);
  });

  it('lists five health regen accessories', () => {
    expect(HEALTH_REGEN_ACCESSORIES).toHaveLength(5);
    expect(getHealthRegenAccessory('pilot-helmet')?.name).toBe('Pilot Helmet');
  });

  it('defines ghost and pain revival rules', () => {
    expect(REVIVAL_RULES).toHaveLength(2);
    expect(REVIVAL_RULES.every((r) => r.uses === 1)).toBe(true);
  });

  it('defines survival titles for low hp', () => {
    expect(SURVIVAL_TITLES).toHaveLength(2);
    expect(qualifiesForSurvivalTitle('immortal-being', 1, true)).toBe(true);
    expect(qualifiesForSurvivalTitle('undefeated-one', 49, true)).toBe(true);
    expect(qualifiesForSurvivalTitle('undefeated-one', 50, true)).toBe(false);
  });

  it('maps mobility scaling by fruit', () => {
    expect(listMobilityRulesForFruit('light')).toHaveLength(1);
    expect(listMobilityRulesForFruit('gas')[0].scaling).toBe('lower-health-faster');
    expect(MOBILITY_HEALTH_SCALING).toHaveLength(2);
  });

  it('scales mobility speed by health fraction', () => {
    expect(mobilitySpeedMultiplier(100, 100, 'higher-health-faster')).toBeCloseTo(1.5);
    expect(mobilitySpeedMultiplier(0, 100, 'lower-health-faster')).toBeCloseTo(1.5);
    expect(healthFraction(50, 100)).toBe(0.5);
  });
});
