import {
  BOAT_DEFINITION_IDS,
  DEFAULT_ISLAND_ID,
  ISLAND_IDS,
  PERSISTED_CARGO_SCHEMA_VERSION,
  PERSISTED_PLAYER_SCHEMA_VERSION,
  SPAWN_ID_BY_ISLAND,
  TRADE_COMMODITY_IDS,
  type BoatDefinitionId,
  type IslandId,
  type PersistedCargoState,
  type PersistedPlayerState,
} from '@pirate-fruit/shared';

const MAX_SAFE_VALUE = Number.MAX_SAFE_INTEGER;
const MAX_DOCUMENT_BYTES = 48 * 1024;
const MAX_ID_COUNT = 256;
const MAX_ITEM_QUANTITY = 999_999;
const MAX_WORLD_COORDINATE = 10_000;
const MAX_WORLD_HEIGHT = 5_000;
const MAX_LEVEL = 2_800;
const MAX_STAT = 2_800;
const MAX_MASTERY = 600;
const VALID_ID = /^[a-z0-9][a-z0-9:_-]{0,127}$/;
const LOADOUT_CATEGORIES = ['style', 'sword', 'gun', 'fruit', 'utility'] as const;
const WEAPON_KINDS = ['sword', 'gun', 'fighting-style'] as const;

const BOAT_DATA: Record<BoatDefinitionId, {
  name: string;
  maxHp: number;
  cargoCapacity: number;
}> = {
  'training-dinghy': { name: 'เรือพายฝึกหัด', maxHp: 130, cargoCapacity: 8 },
  'swift-sloop': { name: 'เรือใบวายุ', maxHp: 100, cargoCapacity: 12 },
  'merchant-brig': { name: 'เรือพาณิชย์คาราวาน', maxHp: 360, cargoCapacity: 24 },
  'war-galleon': { name: 'เรือรบแกลเลียน', maxHp: 720, cargoCapacity: 32 },
  'viking-raider': { name: 'เรือจู่โจมไวกิ้ง', maxHp: 440, cargoCapacity: 20 },
};

export class PlayerDocumentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlayerDocumentValidationError';
  }
}

export interface CanonicalMasteryEntry {
  itemId: string;
  category: (typeof LOADOUT_CATEGORIES)[number];
  level: number;
  exp: number;
}

export interface CanonicalProgression {
  level: number;
  exp: number;
  statPoints: number;
  stats: {
    combat: number;
    vitality: number;
    blade: number;
    ranged: number;
    fruitPower: number;
    mana: number;
  };
  mastery: Record<string, CanonicalMasteryEntry>;
  coins: number;
  completedQuestIds: string[];
  activeQuestId: string | null;
  activeQuestProgress: number[];
}

export interface CanonicalCheckpoint {
  islandId: IslandId;
  spawnId: string;
  position: { x: number; y: number; z: number };
  heading: number;
  cameraYaw: number;
  worldTime: number;
  hp: number;
  energy: number;
  mp: number;
}

export interface CanonicalSkillLoadout {
  activeSet: 'weapon' | 'fruit';
  equippedWeaponKind: (typeof WEAPON_KINDS)[number];
  equippedSwordId: string | null;
  equippedGunId: string | null;
  equippedFightingStyleId: string | null;
  equippedFruitId: string | null;
  fruitAwakened: boolean;
}

export interface CanonicalInventory {
  ownedSwords: string[];
  ownedGuns: string[];
  ownedStyles: string[];
  ownedFruits: string[];
  consumables: Record<string, number>;
  quickslots: Array<string | null>;
  loadout: CanonicalSkillLoadout;
}

export interface CanonicalBoat {
  definitionId: BoatDefinitionId;
  name: string;
  maxHp: number;
  cargoCapacity: number;
  upgrades: { hull: number; cannon: number; sail: number };
  active: boolean;
}

export interface CanonicalLegacyLoadout {
  slots: Partial<Record<(typeof LOADOUT_CATEGORIES)[number], string | null>>;
  activeCategory: (typeof LOADOUT_CATEGORIES)[number];
}

export interface CanonicalCargo {
  maxSlots: number;
  maxWeight: number;
  slots: Array<{ commodityId: string; quantity: number }>;
}

export interface CanonicalPlayerState {
  checkpoint: CanonicalCheckpoint;
  progression: CanonicalProgression;
  inventory: CanonicalInventory;
  boats: CanonicalBoat[];
  loadout: CanonicalLegacyLoadout;
  cargo: CanonicalCargo;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseDocument(label: string, document: string | null): unknown {
  if (document === null || document === '') return null;
  if (new TextEncoder().encode(document).byteLength > MAX_DOCUMENT_BYTES) {
    throw new PlayerDocumentValidationError(`${label} document is too large`);
  }
  try {
    return JSON.parse(document) as unknown;
  } catch {
    throw new PlayerDocumentValidationError(`${label} document is not valid JSON`);
  }
}

function finiteInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function strictCoordinate(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new PlayerDocumentValidationError(`${label} is outside the allowed world bounds`);
  }
  return value;
}

function cleanId(value: unknown): string | null {
  return typeof value === 'string' && VALID_ID.test(value) ? value : null;
}

function cleanIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const id = cleanId(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    if (result.length >= MAX_ID_COUNT) break;
  }
  return result;
}

function sanitizeMastery(value: unknown): Record<string, CanonicalMasteryEntry> {
  const result: Record<string, CanonicalMasteryEntry> = {};
  for (const [rawId, rawEntry] of Object.entries(record(value)).slice(0, MAX_ID_COUNT)) {
    const itemId = cleanId(rawId);
    const entry = record(rawEntry);
    const category = LOADOUT_CATEGORIES.includes(
      entry.category as (typeof LOADOUT_CATEGORIES)[number],
    )
      ? (entry.category as (typeof LOADOUT_CATEGORIES)[number])
      : null;
    if (!itemId || !category) continue;
    result[itemId] = {
      itemId,
      category,
      level: finiteInt(entry.level, 1, 1, MAX_MASTERY),
      exp: finiteInt(entry.exp, 0, 0, MAX_SAFE_VALUE),
    };
  }
  if (!result['basic-brawl']) {
    result['basic-brawl'] = {
      itemId: 'basic-brawl',
      category: 'style',
      level: 1,
      exp: 0,
    };
  }
  if (!result['training-sword']) {
    result['training-sword'] = {
      itemId: 'training-sword',
      category: 'sword',
      level: 1,
      exp: 0,
    };
  }
  return result;
}

export function defaultProgression(): CanonicalProgression {
  return {
    level: 1,
    exp: 0,
    statPoints: 0,
    stats: { combat: 1, vitality: 1, blade: 1, ranged: 1, fruitPower: 1, mana: 1 },
    mastery: sanitizeMastery(null),
    coins: 0,
    completedQuestIds: [],
    activeQuestId: null,
    activeQuestProgress: [],
  };
}

function sanitizeProgression(document: string | null): CanonicalProgression {
  const parsed = parseDocument('progression', document);
  if (parsed === null) return defaultProgression();
  const envelope = record(parsed);
  if ('version' in envelope && envelope.version !== 1) {
    throw new PlayerDocumentValidationError('Unsupported progression schema version');
  }
  const source = record(envelope.progression ?? envelope);
  const player = record(source.player);
  const stats = record(player.stats);
  const level = finiteInt(player.level, 1, 1, MAX_LEVEL);
  const activeQuestId = cleanId(source.activeQuestId);
  return {
    level,
    exp: level === MAX_LEVEL ? 0 : finiteInt(player.exp, 0, 0, MAX_SAFE_VALUE),
    statPoints: finiteInt(player.statPoints, 0, 0, MAX_LEVEL * 6),
    stats: {
      combat: finiteInt(stats.combat, 1, 1, MAX_STAT),
      vitality: finiteInt(stats.vitality, 1, 1, MAX_STAT),
      blade: finiteInt(stats.blade, 1, 1, MAX_STAT),
      ranged: finiteInt(stats.ranged, 1, 1, MAX_STAT),
      fruitPower: finiteInt(stats.fruitPower, 1, 1, MAX_STAT),
      mana: finiteInt(stats.mana, 1, 1, MAX_STAT),
    },
    mastery: sanitizeMastery(source.mastery),
    coins: finiteInt(source.coins, 0, 0, MAX_SAFE_VALUE),
    completedQuestIds: cleanIdList(source.completedQuestIds),
    activeQuestId,
    activeQuestProgress:
      activeQuestId && Array.isArray(source.activeQuestProgress)
        ? source.activeQuestProgress
            .slice(0, 32)
            .map((count) => finiteInt(count, 0, 0, MAX_ITEM_QUANTITY))
        : [],
  };
}

function resourceCaps(progression: CanonicalProgression): {
  maxHp: number;
  maxEnergy: number;
  maxMp: number;
} {
  return {
    maxHp: 100 + (progression.stats.vitality - 1) * 5,
    maxEnergy: 100 + (progression.stats.combat - 1) * 5,
    maxMp: 100 + (progression.stats.mana - 1) * 5,
  };
}

export function sanitizeCheckpoint(
  document: string | null,
  progression: CanonicalProgression,
): CanonicalCheckpoint {
  const parsed = parseDocument('checkpoint', document);
  const source = record(parsed);
  if ('saveVersion' in source && ![2, 3, 4].includes(source.saveVersion as number)) {
    throw new PlayerDocumentValidationError('Unsupported checkpoint schema version');
  }
  const islandId = ISLAND_IDS.includes(source.islandId as IslandId)
    ? (source.islandId as IslandId)
    : DEFAULT_ISLAND_ID;
  const expectedSpawn = SPAWN_ID_BY_ISLAND[islandId];
  const suppliedSpawn = source.spawnId ?? expectedSpawn;
  if (suppliedSpawn !== expectedSpawn) {
    throw new PlayerDocumentValidationError('checkpoint spawnId does not belong to islandId');
  }
  const caps = resourceCaps(progression);
  return {
    islandId,
    spawnId: expectedSpawn,
    position: parsed === null
      ? { x: 0, y: 0, z: 8 }
      : {
          x: strictCoordinate(source.x, 'checkpoint.x', -MAX_WORLD_COORDINATE, MAX_WORLD_COORDINATE),
          y: strictCoordinate(source.y, 'checkpoint.y', -1_000, MAX_WORLD_HEIGHT),
          z: strictCoordinate(source.z, 'checkpoint.z', -MAX_WORLD_COORDINATE, MAX_WORLD_COORDINATE),
        },
    heading: finiteNumber(source.heading, 0, -Math.PI * 8, Math.PI * 8),
    cameraYaw: finiteNumber(source.cameraYaw, 0, -Math.PI * 8, Math.PI * 8),
    worldTime: finiteNumber(source.worldTime, 0.31, 0, 1),
    hp: finiteInt(source.hp, caps.maxHp, 0, caps.maxHp),
    energy: finiteInt(source.energy, caps.maxEnergy, 0, caps.maxEnergy),
    mp: finiteInt(source.mp, caps.maxMp, 0, caps.maxMp),
  };
}

function sanitizeSkillLoadout(value: unknown): CanonicalSkillLoadout {
  const source = record(value);
  const weapon = WEAPON_KINDS.includes(source.equippedWeaponKind as CanonicalSkillLoadout['equippedWeaponKind'])
    ? (source.equippedWeaponKind as CanonicalSkillLoadout['equippedWeaponKind'])
    : 'fighting-style';
  return {
    activeSet: source.activeSet === 'fruit' ? 'fruit' : 'weapon',
    equippedWeaponKind: weapon,
    equippedSwordId: cleanId(source.equippedSwordId),
    equippedGunId: cleanId(source.equippedGunId),
    equippedFightingStyleId: cleanId(source.equippedFightingStyleId) ?? 'combat',
    equippedFruitId: cleanId(source.equippedFruitId),
    fruitAwakened: source.fruitAwakened === true,
  };
}

function sanitizeInventory(document: string | null): CanonicalInventory {
  const source = record(parseDocument('inventory', document));
  const consumables: Record<string, number> = {};
  for (const [rawId, rawQuantity] of Object.entries(record(source.consumables)).slice(0, MAX_ID_COUNT)) {
    const id = cleanId(rawId);
    if (!id) continue;
    const quantity = finiteInt(rawQuantity, 0, 0, MAX_ITEM_QUANTITY);
    if (quantity > 0) consumables[id] = quantity;
  }
  const quickslots = Array.isArray(source.quickslots)
    ? source.quickslots.slice(0, 2).map((id) => cleanId(id))
    : [null, null];
  while (quickslots.length < 2) quickslots.push(null);
  const ownedStyles = cleanIdList(source.ownedStyles);
  if (!ownedStyles.includes('combat')) ownedStyles.unshift('combat');
  return {
    ownedSwords: cleanIdList(source.ownedSwords),
    ownedGuns: cleanIdList(source.ownedGuns),
    ownedStyles,
    ownedFruits: cleanIdList(source.ownedFruits),
    consumables,
    quickslots,
    loadout: sanitizeSkillLoadout(source.loadout),
  };
}

function isBoatId(value: unknown): value is BoatDefinitionId {
  return BOAT_DEFINITION_IDS.includes(value as BoatDefinitionId);
}

function sanitizeBoats(document: string | null): CanonicalBoat[] {
  const source = record(parseDocument('boats', document));
  const owned = Array.isArray(source.ownedBoatIds)
    ? [...new Set(source.ownedBoatIds.filter(isBoatId))]
    : [];
  const selected = isBoatId(source.selectedBoatId) && owned.includes(source.selectedBoatId)
    ? source.selectedBoatId
    : owned[0] ?? null;
  const upgrades = record(source.upgrades);
  return owned.map((definitionId) => {
    const levels = record(upgrades[definitionId]);
    const hull = finiteInt(levels.hull, 0, 0, 3);
    const base = BOAT_DATA[definitionId];
    return {
      definitionId,
      name: base.name,
      maxHp: Math.round(base.maxHp * (1 + hull * 0.16)),
      cargoCapacity: base.cargoCapacity,
      upgrades: {
        hull,
        cannon: finiteInt(levels.cannon, 0, 0, 3),
        sail: finiteInt(levels.sail, 0, 0, 3),
      },
      active: definitionId === selected,
    };
  });
}

function sanitizeLegacyLoadout(document: string | null): CanonicalLegacyLoadout {
  const source = record(parseDocument('loadout', document));
  const rawSlots = record(source.slots);
  const slots: CanonicalLegacyLoadout['slots'] = {};
  for (const category of LOADOUT_CATEGORIES) {
    slots[category] = rawSlots[category] === null ? null : cleanId(rawSlots[category]);
  }
  if (!slots.style) slots.style = 'basic-brawl';
  const activeCategory = LOADOUT_CATEGORIES.includes(source.activeCategory as CanonicalLegacyLoadout['activeCategory'])
    && slots[source.activeCategory as CanonicalLegacyLoadout['activeCategory']]
    ? (source.activeCategory as CanonicalLegacyLoadout['activeCategory'])
    : 'style';
  return { slots, activeCategory };
}

function sanitizeCargo(document: string | null, boats: CanonicalBoat[]): CanonicalCargo {
  const source = record(parseDocument('cargo', document));
  const allowed = new Set<string>(TRADE_COMMODITY_IDS);
  const totals = new Map<string, number>();
  if (Array.isArray(source.slots)) {
    for (const rawSlot of source.slots.slice(0, MAX_ID_COUNT)) {
      const slot = record(rawSlot);
      const commodityId = cleanId(slot.commodityId);
      if (!commodityId || !allowed.has(commodityId)) continue;
      const quantity = finiteInt(slot.quantity, 0, 0, MAX_ITEM_QUANTITY);
      if (quantity <= 0) continue;
      totals.set(
        commodityId,
        Math.min(MAX_ITEM_QUANTITY, (totals.get(commodityId) ?? 0) + quantity),
      );
    }
  }
  const active = boats.find((boat) => boat.active);
  return {
    maxSlots: active?.cargoCapacity ?? 8,
    maxWeight: active ? active.cargoCapacity * 15 : 120,
    slots: [...totals.entries()]
      .slice(0, active?.cargoCapacity ?? 8)
      .map(([commodityId, quantity]) => ({ commodityId, quantity })),
  };
}

export function sanitizePlayerDocuments(
  player: PersistedPlayerState,
  cargo: PersistedCargoState = {
    schemaVersion: PERSISTED_CARGO_SCHEMA_VERSION,
    cargo: null,
  },
): CanonicalPlayerState {
  if (player.schemaVersion !== PERSISTED_PLAYER_SCHEMA_VERSION) {
    throw new PlayerDocumentValidationError('Unsupported player document schema version');
  }
  if (cargo.schemaVersion !== PERSISTED_CARGO_SCHEMA_VERSION) {
    throw new PlayerDocumentValidationError('Unsupported cargo document schema version');
  }
  const progression = sanitizeProgression(player.progression);
  const boats = sanitizeBoats(player.boats);
  return {
    progression,
    checkpoint: sanitizeCheckpoint(player.checkpoint, progression),
    inventory: sanitizeInventory(player.inventory),
    boats,
    loadout: sanitizeLegacyLoadout(player.loadout),
    cargo: sanitizeCargo(cargo.cargo, boats),
  };
}

export function defaultPlayerState(): CanonicalPlayerState {
  return sanitizePlayerDocuments({
    schemaVersion: PERSISTED_PLAYER_SCHEMA_VERSION,
    checkpoint: null,
    progression: null,
    inventory: null,
    boats: null,
    loadout: null,
  });
}

export function serializePlayerState(state: CanonicalPlayerState): {
  player: PersistedPlayerState;
  cargo: PersistedCargoState;
} {
  const checkpoint = {
    saveVersion: 4,
    x: state.checkpoint.position.x,
    y: state.checkpoint.position.y,
    z: state.checkpoint.position.z,
    heading: state.checkpoint.heading,
    cameraYaw: state.checkpoint.cameraYaw,
    worldTime: state.checkpoint.worldTime,
    spawnId: state.checkpoint.spawnId,
    islandId: state.checkpoint.islandId,
    hp: state.checkpoint.hp,
    energy: state.checkpoint.energy,
    mp: state.checkpoint.mp,
  };
  const progression = {
    version: 1,
    progression: {
      player: {
        level: state.progression.level,
        exp: state.progression.exp,
        statPoints: state.progression.statPoints,
        stats: state.progression.stats,
      },
      mastery: state.progression.mastery,
      coins: state.progression.coins,
      completedQuestIds: state.progression.completedQuestIds,
      activeQuestId: state.progression.activeQuestId,
      activeQuestProgress: state.progression.activeQuestProgress,
    },
  };
  const inventory = {
    coins: state.progression.coins,
    ownedSwords: state.inventory.ownedSwords,
    ownedGuns: state.inventory.ownedGuns,
    ownedStyles: state.inventory.ownedStyles,
    ownedFruits: state.inventory.ownedFruits,
    consumables: state.inventory.consumables,
    quickslots: state.inventory.quickslots,
    loadout: {
      ...state.inventory.loadout,
      swordMastery: 1,
      gunMastery: 1,
      fightingStyleMastery: 1,
      fruitMastery: 1,
    },
  };
  const ownedBoatIds = state.boats.map((boat) => boat.definitionId);
  const boats = {
    coins: state.progression.coins,
    ownedBoatIds,
    selectedBoatId: state.boats.find((boat) => boat.active)?.definitionId ?? ownedBoatIds[0] ?? null,
    upgrades: Object.fromEntries(
      state.boats.map((boat) => [boat.definitionId, boat.upgrades]),
    ),
  };
  return {
    player: {
      schemaVersion: PERSISTED_PLAYER_SCHEMA_VERSION,
      checkpoint: JSON.stringify(checkpoint),
      progression: JSON.stringify(progression),
      inventory: JSON.stringify(inventory),
      boats: JSON.stringify(boats),
      loadout: JSON.stringify(state.loadout),
    },
    cargo: {
      schemaVersion: PERSISTED_CARGO_SCHEMA_VERSION,
      cargo: JSON.stringify(state.cargo),
    },
  };
}

export function canonicalBoatData(definitionId: BoatDefinitionId) {
  return BOAT_DATA[definitionId];
}

export function canonicalResourceCaps(progression: CanonicalProgression) {
  return resourceCaps(progression);
}
