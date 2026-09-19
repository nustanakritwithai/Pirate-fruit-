/** ระบบ Energy — อ้างอิง https://blox-fruits.fandom.com/wiki/Energy */

export interface EnergySystemConfig {
  /** สูตรหลัก: 5 × (Melee + 19) */
  energyFormula: string;
  energyPerMeleePoint: number;
  meleeFormulaOffset: number;
  startingEnergy: number;
  maxMeleePoints: number;
  maxEnergyBase: number;
  dashEnergyCost: number;
  rabbitDashEnergyCost: number;
  groundRegenMultiplier: number;
  lowEnergyMessageTemplate: string;
}

export interface MaxEnergyScenario {
  id: string;
  name: string;
  nameTh: string;
  meleePoints: number;
  bonusEnergy: number;
  totalEnergy: number;
  requirements: string;
  requirementsTh: string;
}

export interface EnergyDrainCost {
  id: string;
  name: string;
  nameTh: string;
  energyCost: number;
  condition?: string;
}

export interface EnergyActionRule {
  id: string;
  name: string;
  nameTh: string;
  drainsEnergy: boolean;
  notes?: string;
}

export interface EnergyRegenRule {
  id: string;
  rule: string;
  ruleTh: string;
}

export interface EnergyTitle {
  id: string;
  titleNumber: number;
  name: string;
  nameTh: string;
  condition: string;
  conditionTh: string;
}

export interface EnergyEnchantment {
  id: string;
  name: string;
  nameTh: string;
  effect: string;
  effectTh: string;
}
