import type { HealthSystemConfig } from '../types';

/** ค่าคงที่หลักจาก Blox Fruits Wiki — Health */
export const HEALTH_SYSTEM_CONFIG: HealthSystemConfig = {
  healthFormula: '5 × (Defense + 19)',
  healthPerDefensePoint: 5,
  defenseFormulaOffset: 19,
  startingHealth: 100,
  maxDefensePoints: 2800,
  maxHealthBase: 14_095,
  auraDamageReductionPercent: 0.3,
} as const;
