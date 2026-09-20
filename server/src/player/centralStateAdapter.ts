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
  type CanonicalPlayerState,
} from './playerState.js';
import type { AuthoritativeCombatProfile } from '../realtime/combatProfile.js';

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
