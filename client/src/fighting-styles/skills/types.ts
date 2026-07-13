/** สกิลสไตล์ต่อสู้ (ปุ่ม Z/X/C/V) */
export type FightingStyleSkillKey = 'Z' | 'X' | 'C' | 'V' | string;

export interface FightingStyleSkillDefinition {
  id: string;
  styleId: string;
  key: FightingStyleSkillKey;
  name: string;
  version: string;
  mastery: number | null;
  cooldown: number | null;
  energy: number | null;
  breaksInstinct: boolean;
  description: string;
}
