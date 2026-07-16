import type { IslandId } from '../types/ids.js';

export const DEFAULT_ISLAND_ID: IslandId = 'starter-island';
export const DEFAULT_SPAWN_ID = 'starter-village';

export const SPAWN_ID_BY_ISLAND = {
  'starter-island': 'starter-village',
  'mist-jungle': 'mist-jungle-camp',
  'sunscar-desert': 'sunscar-caravan-city',
  'azure-frost': 'azure-frost-village',
  'tempest-sky': 'tempest-cliff-village',
  'ember-volcano': 'ember-forge-village',
} as const satisfies Record<IslandId, string>;

export const BOAT_DEFINITION_IDS = [
  'training-dinghy',
  'swift-sloop',
  'merchant-brig',
  'war-galleon',
  'viking-raider',
] as const;

export type BoatDefinitionId = (typeof BOAT_DEFINITION_IDS)[number];
