import { SWORDS, SWORD_BY_ID } from './databook/swords';
import type { SwordDefinition, SwordRarity } from './types';

export { SWORDS, SWORD_BY_ID };

export function getSword(id: string): SwordDefinition | undefined {
  return SWORD_BY_ID[id];
}

export function listSwordsByRarity(rarity: SwordRarity): SwordDefinition[] {
  return SWORDS.filter((s) => s.rarity === rarity);
}
