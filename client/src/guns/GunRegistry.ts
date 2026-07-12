import { GUNS, GUN_BY_ID } from './databook/guns';
import type { GunDefinition, GunRarity } from './types';

export { GUNS, GUN_BY_ID };

export function getGun(id: string): GunDefinition | undefined {
  return GUN_BY_ID[id];
}

export function listGunsByRarity(rarity: GunRarity): GunDefinition[] {
  return GUNS.filter((g) => g.rarity === rarity);
}

export function listAvailableGuns(): GunDefinition[] {
  return GUNS.filter((g) => g.available);
}
