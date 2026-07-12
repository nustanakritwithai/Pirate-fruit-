/** สกิลผลไม้ — อ้างอิง Blox Fruits (ปุ่ม Z/X/C/V/F) */
export type SkillKey = 'Z' | 'X' | 'C' | 'V' | 'F' | string;

export interface FruitSkillDefinition {
  id: string;
  fruitId: string;
  key: SkillKey;
  name: string;
  /** ชื่อ moveset เช่น "Moveset (V1)", "Moveset (V2)", "Moveset:Normal" */
  version: string;
  mastery: number | null;
  cooldown: number | null;
  energy: number | null;
  breaksInstinct: boolean;
  awakeningFragmentCost: number | null;
  description: string;
}
