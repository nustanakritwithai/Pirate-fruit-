export type IslandId =
  | 'starter-island'
  | 'mist-jungle'
  | 'sunscar-desert'
  | 'azure-frost'
  | 'tempest-sky'
  | 'ember-volcano';

export type EconomyCellId =
  | 'leaf-island'
  | 'mine-island'
  | 'cloth-island'
  | 'shipyard-island'
  | 'frost-island'
  | 'sky-island'
  | 'volcano-island';

export type LivingCommodityId =
  | 'fresh-fish'
  | 'dried-fish'
  | 'hardwood'
  | 'iron-ore'
  | 'iron-ingot'
  | 'tools'
  | 'sun-silk'
  | 'rope'
  | 'luxury-cloth'
  | 'healing-herb'
  | 'herbal-medicine'
  | 'sailcloth'
  | 'repair-kit'
  | 'trade-crate'
  | 'frost-crystal'
  | 'storm-core'
  | 'volcanic-ore';

export type ItemId = string;
export type QuestId = string;

export const ISLAND_IDS: readonly IslandId[] = [
  'starter-island',
  'mist-jungle',
  'sunscar-desert',
  'azure-frost',
  'tempest-sky',
  'ember-volcano',
];

export const LIVING_COMMODITY_IDS: readonly LivingCommodityId[] = [
  'fresh-fish',
  'dried-fish',
  'hardwood',
  'iron-ore',
  'iron-ingot',
  'tools',
  'sun-silk',
  'rope',
  'luxury-cloth',
  'healing-herb',
  'herbal-medicine',
  'sailcloth',
  'repair-kit',
  'trade-crate',
  'frost-crystal',
  'storm-core',
  'volcanic-ore',
];
