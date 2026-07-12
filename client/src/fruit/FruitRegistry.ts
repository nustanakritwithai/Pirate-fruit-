import { DEVIL_FRUITS, DEVIL_FRUIT_BY_ID } from './databook/fruits';
import type { DevilFruitDefinition, FruitRarity, FruitType } from './types';

export { DEVIL_FRUITS, DEVIL_FRUIT_BY_ID };

export function getFruit(id: string): DevilFruitDefinition | undefined {
  return DEVIL_FRUIT_BY_ID[id];
}

export function listFruitsByRarity(rarity: FruitRarity): DevilFruitDefinition[] {
  return DEVIL_FRUITS.filter((f) => f.rarity === rarity);
}

export function listFruitsByType(type: FruitType): DevilFruitDefinition[] {
  return DEVIL_FRUITS.filter((f) => f.type === type);
}
