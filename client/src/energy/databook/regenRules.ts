import type { EnergyRegenRule } from '../types';
import { ENERGY_SYSTEM_CONFIG } from './config';

/** กฎฟื้น Energy */
export const ENERGY_REGEN_RULES: readonly EnergyRegenRule[] = [
  {
    id: 'scales-with-melee',
    rule: 'Energy regeneration scales with Melee stats — higher stats regen faster',
    ruleTh: 'ความเร็วฟื้น Energy ขึ้นกับแต้ม Melee',
  },
  {
    id: 'ground-2x',
    rule: `Regeneration is ${ENERGY_SYSTEM_CONFIG.groundRegenMultiplier}x faster on the ground`,
    ruleTh: `ฟื้น Energy บนพื้นเร็วกว่า ${ENERGY_SYSTEM_CONFIG.groundRegenMultiplier} เท่า`,
  },
] as const;
