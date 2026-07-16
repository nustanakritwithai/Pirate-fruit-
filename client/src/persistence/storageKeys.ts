export const GAMEPLAY_STORAGE_KEYS = {
  checkpoint: 'pirate-fruit:save-v1',
  progression: 'pirate-fruit:progression-v1',
  boats: 'pirate-fruit:boats-v1',
  inventory: 'pirate-fruit:items-v1',
  loadout: 'pirate-fruit:loadout-v1',
  cargo: 'pirate-fruit:cargo-v1',
  economy: 'pirate-fruit:economy-v1',
} as const;

export type GameplayStorageKey = (typeof GAMEPLAY_STORAGE_KEYS)[keyof typeof GAMEPLAY_STORAGE_KEYS];

export const PLAYER_STORAGE_KEYS = [
  GAMEPLAY_STORAGE_KEYS.checkpoint,
  GAMEPLAY_STORAGE_KEYS.progression,
  GAMEPLAY_STORAGE_KEYS.boats,
  GAMEPLAY_STORAGE_KEYS.inventory,
  GAMEPLAY_STORAGE_KEYS.loadout,
] as const;
