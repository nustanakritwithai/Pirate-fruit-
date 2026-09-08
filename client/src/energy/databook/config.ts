import type { EnergySystemConfig } from '../types';

/** ค่าคงที่หลักจาก Blox Fruits Wiki — Energy */
export const ENERGY_SYSTEM_CONFIG: EnergySystemConfig = {
  energyFormula: '5 × (Melee + 19)',
  energyPerMeleePoint: 5,
  meleeFormulaOffset: 19,
  startingEnergy: 100,
  maxMeleePoints: 2800,
  maxEnergyBase: 14_095,
  dashEnergyCost: 30,
  rabbitDashEnergyCost: 15,
  groundRegenMultiplier: 2,
  lowEnergyMessageTemplate: 'Low energy! {cost} energy required.',
} as const;
