import {
  MONSTER_PROTOCOL_SCHEMA_VERSION,
  resourceCapsForStats,
  type CombatStatCategory,
  type MonsterKillEntry,
  type MonsterKillsRequest,
  type MonsterKillsResponse,
  type PersistedCargoState,
  type PersistedPlayerState,
} from '@pirate-fruit/shared';
import {
  sanitizeLocalMigrationDocuments,
  serializePlayerState,
  sanitizeCheckpoint,
  sanitizePlayerDocuments,
  type CanonicalPlayerState,
} from './playerState.js';
import type { AuthoritativeCombatProfile } from '../realtime/combatProfile.js';
import { z } from 'zod';
import { ISLAND_IDS, SPAWN_ID_BY_ISLAND, type IslandId } from '@pirate-fruit/shared';

const statAmount = z.number().int().positive().max(2800).optional();
const itemId = z.string().min(1).max(128).nullable();
const stateOperation = z.discriminatedUnion('type', [
  z.object({ type: z.literal('checkpoint'), checkpoint: z.string().max(48 * 1024) }).strict(),
  z.object({ type: z.literal('statAllocation'), allocations: z.object({
    combat: statAmount, vitality: statAmount, blade: statAmount,
    ranged: statAmount, fruitPower: statAmount, mana: statAmount,
  }).strict() }).strict(),
  z.object({ type: z.literal('boatSelection'), selectedBoatId: z.string().min(1).max(128) }).strict(),
  z.object({ type: z.literal('loadout'), inventoryLoadout: z.object({
    activeSet: z.enum(['weapon', 'fruit']), equippedWeaponKind: z.enum(['sword', 'gun', 'fighting-style']),
    equippedSwordId: itemId, equippedGunId: itemId, equippedFightingStyleId: itemId,
    equippedFruitId: itemId, fruitAwakened: z.boolean(),
  }).strict(), loadout: z.object({
    slots: z.object({ style: itemId.optional(), sword: itemId.optional(), gun: itemId.optional(),
      fruit: itemId.optional(), utility: itemId.optional() }).strict(),
    activeCategory: z.enum(['style', 'sword', 'gun', 'fruit', 'utility']),
  }).strict(), quickslots: z.array(itemId).length(2).optional() }).strict(),
]);

/** ใช้เอกสารและข้อจำกัดเดิม โดยรับเฉพาะคำสั่งที่ไม่สร้างเงินหรือสิ่งของ */
export function applyCanonicalStateOperation(current: CanonicalPlayerState, input: unknown,
  position?: { islandId: string; x: number; y: number; z: number; heading: number } | null,
): NormalizedInitialState {
  const operation = stateOperation.parse(input);
  const state = structuredClone(current);
  if (operation.type === 'statAllocation') {
    let total = 0;
    for (const [key, amount] of Object.entries(operation.allocations)) {
      if (amount === undefined) continue;
      const stat = key as keyof typeof state.progression.stats;
      if (state.progression.stats[stat] + amount > 2800) throw new Error('stat-limit-exceeded');
      state.progression.stats[stat] += amount; total += amount;
    }
    if (total === 0 || total > current.progression.statPoints) throw new Error('insufficient-stat-points');
    state.progression.statPoints -= total;
  } else if (operation.type === 'checkpoint') {
    const proposed = sanitizeCheckpoint(operation.checkpoint, state.progression);
    // พิกัดมาจาก presence ที่ server รับไว้; ไม่รับการเพิ่ม HP จากการ save
    state.checkpoint = { ...proposed, ...state.checkpoint,
      cameraYaw: proposed.cameraYaw, worldTime: proposed.worldTime };
    if (position && ISLAND_IDS.includes(position.islandId as IslandId)) {
      const islandId = position.islandId as IslandId;
      state.checkpoint = { ...state.checkpoint, islandId, spawnId: SPAWN_ID_BY_ISLAND[islandId],
      position: { x: position.x, y: position.y, z: position.z }, heading: position.heading };
    }
  } else if (operation.type === 'boatSelection') {
    if (!state.boats.some((boat) => boat.definitionId === operation.selectedBoatId)) {
      throw new Error('boat-not-owned');
    }
    // เปลี่ยนได้เฉพาะเรือที่ server มีอยู่แล้ว ไม่สร้างเรือ/เงิน/อัปเกรดจาก client
    state.boats = state.boats.map((boat) => ({ ...boat, active: boat.definitionId === operation.selectedBoatId }));
  } else {
    const owned = { sword: state.inventory.ownedSwords, gun: state.inventory.ownedGuns,
      style: state.inventory.ownedStyles, fruit: state.inventory.ownedFruits };
    const proposed = operation.inventoryLoadout;
    for (const [kind, id] of [['sword', proposed.equippedSwordId], ['gun', proposed.equippedGunId],
      ['style', proposed.equippedFightingStyleId], ['fruit', proposed.equippedFruitId]] as const) {
      if (id !== null && !owned[kind].includes(id)) throw new Error('equipped-item-not-owned');
    }
    if (proposed.fruitAwakened !== state.inventory.loadout.fruitAwakened)
      throw new Error('awakening-is-server-owned');
    for (const kind of ['sword', 'gun', 'style', 'fruit'] as const) {
      const id = operation.loadout.slots[kind];
      // ตรงกับข้อยกเว้น built-in ใน PlayerSaveRepository เดิม
      if (id && id !== 'basic-brawl' && id !== 'training-sword' && !owned[kind].includes(id))
        throw new Error('legacy-equipped-item-not-owned');
    }
    if (operation.loadout.slots.utility !== undefined &&
      operation.loadout.slots.utility !== state.loadout.slots.utility) throw new Error('utility-change-unsupported');
    if (operation.quickslots?.some(id => id !== null && !(state.inventory.consumables[id] > 0)))
      throw new Error('quickslot-item-not-owned');
    state.inventory.loadout = proposed;
    if (operation.quickslots) state.inventory.quickslots = operation.quickslots;
    state.loadout = operation.loadout;
    const documents = serializePlayerState(state);
    const normalized = sanitizePlayerDocuments(documents.player, documents.cargo);
    state.inventory.loadout = normalized.inventory.loadout;
    state.loadout = normalized.loadout;
  }
  return { state, persisted: serializePlayerState(state) };
}

/** Canonical state plus the exact persisted shape used by existing save code. */
export interface NormalizedInitialState {
  state: CanonicalPlayerState;
  persisted: ReturnType<typeof serializePlayerState>;
}

/** Normalize legacy local documents once; never invent or reset progression. */
export function normalizeInitialPlayerState(
  player: PersistedPlayerState,
  cargo?: PersistedCargoState,
): NormalizedInitialState {
  const state = sanitizeLocalMigrationDocuments(player, cargo);
  return { state, persisted: serializePlayerState(state) };
}

function weaponCategory(state: CanonicalPlayerState): CombatStatCategory {
  if (state.loadout.activeCategory === 'sword' || state.loadout.activeCategory === 'gun') {
    return state.loadout.activeCategory;
  }
  return 'style';
}

/** Derive the existing combat profile from canonical progression/loadout data. */
export function deriveCanonicalCombatProfile(state: CanonicalPlayerState): AuthoritativeCombatProfile {
  const stats = {
    combat: state.progression.stats.combat,
    vitality: state.progression.stats.vitality,
    blade: state.progression.stats.blade,
    ranged: state.progression.stats.ranged,
    fruitPower: state.progression.stats.fruitPower,
    mana: state.progression.stats.mana,
  };
  const equippedWeapon = weaponCategory(state);
  const vitals = (state as CanonicalPlayerState & { pveVitals?: { buffMultiplier: number; buffUntil: number } }).pveVitals;
  const hasFruit = Boolean(state.inventory.loadout.equippedFruitId);
  const activeSkillCategory: CombatStatCategory = state.loadout.activeCategory === 'fruit' && hasFruit
    ? 'fruit'
    : equippedWeapon;
  return {
    level: state.progression.level,
    stats,
    ...resourceCapsForStats(stats),
    weaponCategory: equippedWeapon,
    activeSkillCategory,
    allowedSkillCategories: hasFruit ? [equippedWeapon, 'fruit'] : [equippedWeapon],
    ...(vitals ? { timedDamageBuff: { multiplier: vitals.buffMultiplier, until: vitals.buffUntil } } : {}),
  };
}

export interface CanonicalKillGrant extends MonsterKillEntry {
  monsterId: string;
  count: number;
}

/** Build the exact request consumed by the existing MonsterService schema. */
export function createCanonicalKillRequest(
  idempotencyKey: string,
  kills: readonly CanonicalKillGrant[],
): MonsterKillsRequest {
  if (idempotencyKey.length === 0) throw new Error('idempotencyKey is required');
  return {
    schemaVersion: MONSTER_PROTOCOL_SCHEMA_VERSION,
    idempotencyKey,
    kills: kills.map(({ monsterId, count }) => ({ monsterId, count })),
  };
}

export interface MonsterRewardAuthority {
  grantKills(characterId: string, body: MonsterKillsRequest): Promise<MonsterKillsResponse>;
}

/** Delegate kill/reward semantics to the existing MonsterService authority. */
export function applyCanonicalKills(
  authority: MonsterRewardAuthority,
  characterId: string,
  idempotencyKey: string,
  kills: readonly CanonicalKillGrant[],
): Promise<MonsterKillsResponse> {
  return authority.grantKills(characterId, createCanonicalKillRequest(idempotencyKey, kills));
}
