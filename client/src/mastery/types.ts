/** ระบบ Mastery — อ้างอิง https://blox-fruits.fandom.com/wiki/Mastery */

export type MasteryItemCategory =
  | 'fighting-style'
  | 'fruit'
  | 'sword'
  | 'gun'
  | 'fishing-rod';

export type MasterySourceKind = 'enemy' | 'boss' | 'raid-boss';

export interface MasterySystemConfig {
  maxMasteryLevel: number;
  fishingRodMaxMastery: number;
  masteryExpFormula: string;
  masteryBonusStatFormula: string;
  maxItemStatBonusFormula: string;
  totalMasteryExpToMax: number;
  totalMasteryExpFishingRodToMax: number;
  maxMasteryMultiplier: number;
  maxMasteryBonusStatPoints: number;
}

export interface MasteryItemCategoryDefinition {
  id: MasteryItemCategory;
  name: string;
  nameTh: string;
  maxMastery: number;
  unlocksSkills: boolean;
}

export interface MasterySourceDefinition {
  id: string;
  name: string;
  nameTh: string;
  kind: MasterySourceKind;
  description: string;
  notes?: string;
}

export interface MasteryMultiplierDefinition {
  id: string;
  name: string;
  nameTh: string;
  multiplier: number;
  stackable: boolean;
  description: string;
}

export interface MasteryTitle {
  id: string;
  titleNumber?: number;
  name: string;
  nameTh: string;
  requirement: string;
  requirementTh: string;
  category?: MasteryItemCategory;
}

export interface BossMasteryReward {
  id: string;
  name: string;
  nameTh: string;
  approximateMastery?: number;
  notes?: string;
}

export interface MasteryCapacityHistoryEntry {
  id: string;
  update: string;
  change: string;
  changeTh: string;
}

export interface MasteryNote {
  id: string;
  note: string;
  noteTh: string;
}

export interface MasteryGrindTip {
  id: string;
  sea: 'first' | 'second' | 'third';
  location: string;
  locationTh: string;
  target: string;
  recommended?: boolean;
  notes?: string;
}
