/** ระบบ Health (HP) — อ้างอิง https://blox-fruits.fandom.com/wiki/Health */

export interface HealthSystemConfig {
  /** สูตรหลัก: 5 × (Defense + 19) */
  healthFormula: string;
  healthPerDefensePoint: number;
  /** ค่าคงที่ในสูตร 5(S + 19) */
  defenseFormulaOffset: number;
  /** HP เริ่มต้นเมื่อ Defense = 1 */
  startingHealth: number;
  maxDefensePoints: number;
  /** HP สูงสุดจาก Defense 2800 เท่านั้น (ไม่มีอุปกรณ์) */
  maxHealthBase: number;
  /** Full body Aura ลดดาเมจก่อนหัก HP */
  auraDamageReductionPercent: number;
}

export interface MaxHealthScenario {
  id: string;
  name: string;
  nameTh: string;
  defensePoints: number;
  bonusHp: number;
  totalHp: number;
  requirements: string;
  requirementsTh: string;
}

export interface HealthRegenAccessory {
  id: string;
  name: string;
  nameTh: string;
  description: string;
}

export interface DamageReductionRule {
  id: string;
  name: string;
  nameTh: string;
  reductionPercent: number;
  description: string;
}

export interface RevivalRule {
  id: string;
  name: string;
  nameTh: string;
  uses: number;
  description: string;
}

export interface HealthRestoreRule {
  id: string;
  trigger: string;
  triggerTh: string;
  restoresHealth: boolean;
  restoresEnergy: boolean;
  blockedWhileInCombat: boolean;
  description: string;
}

export type MobilityHealthScaling = 'higher-health-faster' | 'lower-health-faster';

export interface MobilityScalingRule {
  id: string;
  scaling: MobilityHealthScaling;
  moveKey: string;
  fruitIds: readonly string[];
  description: string;
  descriptionTh: string;
}

export interface HealthExchangeSkill {
  id: string;
  fruitId: string;
  moveKey: string;
  exchange: string;
  exchangeTh: string;
  description: string;
}

export interface SurvivalTitle {
  id: string;
  titleNumber: number;
  name: string;
  nameTh: string;
  condition: string;
  conditionTh: string;
  seaRequirement: string;
}
