/** สกิลปืน (ปุ่ม Z/X) — แยกจากดาบและผลไม้ */
export type GunSkillKey = 'Z' | 'X' | string;

export interface GunSkillDefinition {
  id: string;
  gunId: string;
  key: GunSkillKey;
  name: string;
  version: string;
  mastery: number | null;
  cooldown: number | null;
  energy: number | null;
  breaksInstinct: boolean;
  description: string;
}
