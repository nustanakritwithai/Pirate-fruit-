/** ชุดสกิลที่ผู้เล่นสลับใช้ระหว่างเกม */
export type SkillSetKind = 'weapon' | 'fruit';

export type SkillSlotIndex = 1 | 2 | 3 | 'ultimate';

export interface SkillLoadoutState {
  activeSet: SkillSetKind;
  equippedSwordId: string | null;
  equippedFruitId: string | null;
  swordMastery: number;
  fruitMastery: number;
  fruitAwakened: boolean;
}

export interface ResolvedSkillSlot {
  slot: SkillSlotIndex;
  skillId: string | null;
  label: string;
  locked: boolean;
  lockReason?: string;
}
