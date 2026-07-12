/** สกิลดาบ (ปุ่ม Z/X) — แยกจากสกิลผลไม้ */
export type SwordSkillKey = 'Z' | 'X' | string;

export interface SwordSkillDefinition {
  id: string;
  swordId: string;
  key: SwordSkillKey;
  name: string;
  version: string;
  mastery: number | null;
  cooldown: number | null;
  energy: number | null;
  breaksInstinct: boolean;
  description: string;
}
