import type {
  EnergyActionRule,
  EnergyDrainCost,
  EnergyEnchantment,
  EnergyRegenRule,
  EnergyTitle,
  MaxEnergyScenario,
} from './types';
import {
  ENERGY_DRAIN_COSTS,
  ENERGY_DRAIN_EXCEPTIONS,
  ENERGY_ENCHANTMENTS,
  ENERGY_NO_DRAIN_ACTIONS,
  ENERGY_REGEN_RULES,
  ENERGY_SYSTEM_CONFIG,
  ENERGY_TITLES,
  MAX_ENERGY_SCENARIOS,
} from './databook';

export {
  ENERGY_DRAIN_COSTS,
  ENERGY_DRAIN_EXCEPTIONS,
  ENERGY_ENCHANTMENTS,
  ENERGY_NO_DRAIN_ACTIONS,
  ENERGY_REGEN_RULES,
  ENERGY_SYSTEM_CONFIG,
  ENERGY_TITLES,
  MAX_ENERGY_SCENARIOS,
};

export function getMaxEnergyScenario(id: string): MaxEnergyScenario | undefined {
  return MAX_ENERGY_SCENARIOS.find((s) => s.id === id);
}

export function getEnergyDrainCost(id: string): EnergyDrainCost | undefined {
  return ENERGY_DRAIN_COSTS.find((c) => c.id === id);
}

export function getEnergyNoDrainAction(id: string): EnergyActionRule | undefined {
  return ENERGY_NO_DRAIN_ACTIONS.find((a) => a.id === id);
}

export function getEnergyDrainException(id: string): EnergyActionRule | undefined {
  return ENERGY_DRAIN_EXCEPTIONS.find((a) => a.id === id);
}

export function getEnergyRegenRule(id: string): EnergyRegenRule | undefined {
  return ENERGY_REGEN_RULES.find((r) => r.id === id);
}

export function getEnergyTitle(id: string): EnergyTitle | undefined {
  return ENERGY_TITLES.find((t) => t.id === id);
}

export function getEnergyEnchantment(id: string): EnergyEnchantment | undefined {
  return ENERGY_ENCHANTMENTS.find((e) => e.id === id);
}

export * from './EnergyFormulas';
