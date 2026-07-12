/** ระบบเลเวล — อ้างอิง https://blox-fruits.fandom.com/wiki/Levels */

export interface LevelSystemConfig {
  maxLevel: number;
  statPointsPerLevel: number;
  /** แต้มสเตตัสสูงสุดต่อหมวด = maxLevel (ไม่รวม mastery bonus) */
  maxStatPointsEqualsMaxLevel: boolean;
  /** EXP รวมถึง max level ตาม wiki */
  totalExpToMaxLevel: number;
  /** สูตร EXP ต่อเลเวล: floor(2 × level^2.3 + 84) */
  expFormulaDescription: string;
  pvpUnlockLevel: number;
  pvpReenableMinutesAfterDeath: number;
}

export type ExpSourceKind =
  | 'quest'
  | 'enemy'
  | 'boss'
  | 'raid-boss'
  | 'fishing'
  | 'gravestone'
  | 'code'
  | 'shop-boost';

export interface ExpSourceDefinition {
  id: string;
  name: string;
  nameTh: string;
  kind: ExpSourceKind;
  description: string;
}

export interface ExpMultiplierDefinition {
  id: string;
  name: string;
  nameTh: string;
  multiplier: number;
  description: string;
}

export interface SeaGateDefinition {
  id: string;
  name: string;
  nameTh: string;
  requiredLevel: number;
  /** EXP สะสมตาม wiki (ถ้ามี) */
  wikiCumulativeExp: number | null;
  description: string;
}

export interface BossLevelReward {
  id: string;
  name: string;
  nameTh: string;
  levelsGranted: number;
}

export interface LevelCapHistoryEntry {
  update: string;
  previousCap: number;
  newCap: number;
}

export interface BountyLevelRule {
  id: string;
  description: string;
  descriptionTh: string;
}
