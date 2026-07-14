/** ชุดสกิลที่ผู้เล่นสลับใช้ระหว่างเกม */
export type SkillSetKind = 'weapon' | 'fruit';

/** ประเภทอาวุธ — ใส่ได้ทีละชนิด (ดาบ / ปืน / สไตล์ต่อสู้) */
export type WeaponKind = 'sword' | 'gun' | 'fighting-style';

export type SkillSlotIndex = 1 | 2 | 3 | 'ultimate';

export interface SkillLoadoutState {
  activeSet: SkillSetKind;
  equippedWeaponKind: WeaponKind;
  equippedSwordId: string | null;
  equippedGunId: string | null;
  equippedFightingStyleId: string | null;
  equippedFruitId: string | null;
  swordMastery: number;
  gunMastery: number;
  fightingStyleMastery: number;
  fruitMastery: number;
  fruitAwakened: boolean;
}

export interface ResolvedSkillSlot {
  slot: SkillSlotIndex;
  /** id ของสกิลในช่องนี้ (มีแม้ยังล็อก เพื่อให้ UI โชว์ไอคอน) — null = ไม่มีสกิลช่องนี้เลย */
  skillId: string | null;
  label: string;
  locked: boolean;
  /** Mastery ขั้นต่ำที่ปลดสกิลช่องนี้ (0 = ไม่มีสกิล) */
  masteryRequired: number;
  lockReason?: string;
}
