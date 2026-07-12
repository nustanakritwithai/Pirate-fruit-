import type { EnergyTitle } from '../types';

export const ENERGY_TITLES: readonly EnergyTitle[] = [
  {
    id: 'empty-vessel',
    titleNumber: 67,
    name: 'Empty Vessel',
    nameTh: 'Empty Vessel',
    condition: 'Completely run out of energy',
    conditionTh: 'ใช้ Energy หมดจนสุด',
  },
] as const;
