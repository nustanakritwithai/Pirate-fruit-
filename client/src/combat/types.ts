/** ชุดสกิลที่ผู้เล่นสลับใช้ระหว่างเกม */
export type SkillSetKind = 'weapon' | 'fruit';

/** ประเภทอาวุธระยะใกล้/ไกล — ใส่ได้ทีละชนิด */
export type WeaponKind = 'sword' | 'gun';

export type SkillSlotIndex = 1 | 2 | 3 | 'ultimate';

export interface SkillLoadoutState {
  activeSet: SkillSetKind;
  /** อาวุธที่สวมใส่ (ดาบหรือปืน — ไม่ใส่พร้อมกัน) */
  equippedWeaponKind: WeaponKind;
  equippedSwordId: string | null;
  equippedGunId: string | null;
  equippedFruitId: string | null;
  swordMastery: number;
  gunMastery: number;
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
