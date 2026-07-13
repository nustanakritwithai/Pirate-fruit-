/** ดาบ — อ้างอิง https://blox-fruits.fandom.com/wiki/Swords */
export type SwordRarity = 'common' | 'uncommon' | 'rare' | 'legendary' | 'mythical';

export interface SwordDefinition {
  id: string;
  name: string;
  nameTh: string;
  wikiUrl: string;
  rarity: SwordRarity;
  sea: number | null;
  location: string;
  obtainMethod: string;
  price: number;
  skillIds: readonly string[];
}
