import type { DamageReductionRule } from '../types';
import { HEALTH_SYSTEM_CONFIG } from './config';

/** กฎลดดาเมจก่อนหัก HP */
export const DAMAGE_REDUCTION_RULES: readonly DamageReductionRule[] = [
  {
    id: 'full-body-aura',
    name: 'Full Body Aura',
    nameTh: 'Aura เต็มตัว',
    reductionPercent: HEALTH_SYSTEM_CONFIG.auraDamageReductionPercent,
    description: 'Reduces damage taken by 30% before subtracting from health',
  },
] as const;
