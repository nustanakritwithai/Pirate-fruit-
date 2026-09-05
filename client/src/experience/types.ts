/** ระบบ Experience (EXP) — อ้างอิง https://blox-fruits.fandom.com/wiki/Experience */

export type ExpSourceKind =
  | 'quest'
  | 'combat'
  | 'praying'
  | 'fishing'
  | 'code'
  | 'shop-boost';

export interface ExperienceSystemConfig {
  maxLevel: number;
  /** สูตรหลักจาก Levels wiki: floor(2 × L^2.3 + 84) */
  primaryExpFormula: string;
  /** สูตรประมาณจาก Experience trivia: ≈ 1.73 × L^1.726 */
  approximateExpFormula: string;
  totalExpToMaxLevel: number;
  /** ตกปลาสำเร็จได้ % ของ EXP เลเวลปัจจุบัน */
  fishingExpPercent: number;
  /** Gravestone blessing โอกาสได้ EXP */
  gravestoneBlessingChance: number;
  /** 2x EXP boost คูณเท่าไร (ไม่ stack เกินนี้) */
  shopBoostMultiplier: number;
  /** วินาทีบวกให้ 2x EXP หลังตาย (จาก Levels wiki) */
  deathRespawnBoostGraceSeconds: number;
}

export interface ExpSourceDefinition {
  id: string;
  name: string;
  nameTh: string;
  kind: ExpSourceKind;
  description: string;
  notes?: string;
}

export interface ExpBoostProduct {
  id: string;
  durationMinutes: number;
  robux: number;
  label?: string;
  labelTh?: string;
}

export interface ExpMultiplierDefinition {
  id: string;
  name: string;
  nameTh: string;
  multiplier: number;
  stackable: boolean;
  description: string;
}

export interface ExpMilestone {
  id: string;
  name: string;
  nameTh: string;
  targetLevel: number;
  cumulativeExp: number;
  description: string;
}

export interface ExpStackingRule {
  id: string;
  rule: string;
  ruleTh: string;
}

export interface QuestExpRule {
  id: string;
  rule: string;
  ruleTh: string;
}
