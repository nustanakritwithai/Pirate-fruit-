import type { EnergyDrainCost } from '../types';
import { ENERGY_SYSTEM_CONFIG } from './config';

/** ค่าใช้ Energy สำหรับการกระทำหลัก */
export const ENERGY_DRAIN_COSTS: readonly EnergyDrainCost[] = [
  {
    id: 'dash',
    name: 'Dash',
    nameTh: 'Dash',
    energyCost: ENERGY_SYSTEM_CONFIG.dashEnergyCost,
  },
  {
    id: 'dash-rabbit',
    name: 'Dash (Rabbit race)',
    nameTh: 'Dash (Race Rabbit)',
    energyCost: ENERGY_SYSTEM_CONFIG.rabbitDashEnergyCost,
    condition: 'Rabbit race active',
  },
] as const;
