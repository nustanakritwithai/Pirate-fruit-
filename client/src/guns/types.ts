/** ปืน (อาวุธระยะไกล) — https://blox-fruits.fandom.com/wiki/Guns */
export type GunRarity = 'common' | 'uncommon' | 'rare' | 'legendary' | 'mythical';

export interface GunDefinition {
  id: string;
  name: string;
  nameTh: string;
  wikiUrl: string;
  rarity: GunRarity;
  sea: number | null;
  location: string;
  obtainMethod: string;
  price: number;
  /** false = admin/unobtainable */
  available: boolean;
  skillIds: readonly string[];
}
