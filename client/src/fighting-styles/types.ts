/** สไตล์การต่อสู้ (มือเปล่า) — https://blox-fruits.fandom.com/wiki/Fighting_Styles */
export type FightingStyleSeaTier = 'starter' | 'first-sea' | 'second-sea' | 'third-sea';

export interface FightingStyleDefinition {
  id: string;
  name: string;
  nameTh: string;
  wikiUrl: string;
  sea: number | null;
  seaTier: FightingStyleSeaTier;
  teacher: string;
  price: number;
  skillIds: readonly string[];
}
