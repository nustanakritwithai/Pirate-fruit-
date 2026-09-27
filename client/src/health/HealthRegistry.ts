import type {
  DamageReductionRule,
  HealthExchangeSkill,
  HealthRegenAccessory,
  HealthRestoreRule,
  MaxHealthScenario,
  MobilityScalingRule,
  RevivalRule,
  SurvivalTitle,
} from './types';
import {
  DAMAGE_REDUCTION_RULES,
  HEALTH_EXCHANGE_SKILLS,
  HEALTH_REGEN_ACCESSORIES,
  HEALTH_RESTORE_RULES,
  HEALTH_SYSTEM_CONFIG,
  MAX_HEALTH_SCENARIOS,
  MOBILITY_HEALTH_SCALING,
  REVIVAL_RULES,
  SURVIVAL_TITLES,
} from './databook';

export {
  DAMAGE_REDUCTION_RULES,
  HEALTH_EXCHANGE_SKILLS,
  HEALTH_REGEN_ACCESSORIES,
  HEALTH_RESTORE_RULES,
  HEALTH_SYSTEM_CONFIG,
  MAX_HEALTH_SCENARIOS,
  MOBILITY_HEALTH_SCALING,
  REVIVAL_RULES,
  SURVIVAL_TITLES,
};

export function getMaxHealthScenario(id: string): MaxHealthScenario | undefined {
  return MAX_HEALTH_SCENARIOS.find((s) => s.id === id);
}

export function getHealthRegenAccessory(id: string): HealthRegenAccessory | undefined {
  return HEALTH_REGEN_ACCESSORIES.find((a) => a.id === id);
}

export function getDamageReductionRule(id: string): DamageReductionRule | undefined {
  return DAMAGE_REDUCTION_RULES.find((r) => r.id === id);
}

export function getRevivalRule(id: string): RevivalRule | undefined {
  return REVIVAL_RULES.find((r) => r.id === id);
}

export function getHealthRestoreRule(id: string): HealthRestoreRule | undefined {
  return HEALTH_RESTORE_RULES.find((r) => r.id === id);
}

export function getMobilityScalingRule(id: string): MobilityScalingRule | undefined {
  return MOBILITY_HEALTH_SCALING.find((r) => r.id === id);
}

export function getHealthExchangeSkill(id: string): HealthExchangeSkill | undefined {
  return HEALTH_EXCHANGE_SKILLS.find((s) => s.id === id);
}

export function getSurvivalTitle(id: string): SurvivalTitle | undefined {
  return SURVIVAL_TITLES.find((t) => t.id === id);
}

export function listMobilityRulesForFruit(fruitId: string): MobilityScalingRule[] {
  return MOBILITY_HEALTH_SCALING.filter((r) => r.fruitIds.includes(fruitId));
}

export * from './HealthFormulas';
