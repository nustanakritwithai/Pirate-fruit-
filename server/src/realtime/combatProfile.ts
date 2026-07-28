import {
  PVP_UNLOCK_LEVEL,
  resourceCapsForStats,
  statDamageMultiplier,
  type CharacterStats,
  type CombatStatCategory,
} from '@pirate-fruit/shared';
import type { Pool } from 'pg';
import type { AttackKind } from './combatAuthority.js';

export interface AuthoritativeCombatProfile {
  level: number;
  stats: CharacterStats;
  maxHp: number;
  maxEnergy: number;
  maxMp: number;
  weaponCategory: CombatStatCategory;
  activeSkillCategory: CombatStatCategory;
  allowedSkillCategories: readonly CombatStatCategory[];
}

export interface CombatProfileProvider {
  profile(characterId: string): Promise<AuthoritativeCombatProfile>;
}

export const DEFAULT_COMBAT_STATS: CharacterStats = {
  combat: 1,
  vitality: 1,
  blade: 1,
  ranged: 1,
  fruitPower: 1,
  mana: 1,
};

export function defaultCombatProfile(): AuthoritativeCombatProfile {
  return {
    level: PVP_UNLOCK_LEVEL,
    stats: { ...DEFAULT_COMBAT_STATS },
    ...resourceCapsForStats(DEFAULT_COMBAT_STATS),
    weaponCategory: 'style',
    activeSkillCategory: 'style',
    allowedSkillCategories: ['style'],
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stat(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, Math.min(2_800, Math.floor(value)))
    : 1;
}

function weaponCategory(value: unknown): CombatStatCategory {
  if (value === 'sword' || value === 'gun') return value;
  return 'style';
}

export function combatCategoryFor(
  profile: AuthoritativeCombatProfile,
  kind: AttackKind,
  requested?: CombatStatCategory,
): CombatStatCategory {
  if (kind === 'melee') return profile.weaponCategory;
  if (requested && profile.allowedSkillCategories.includes(requested)) return requested;
  return profile.activeSkillCategory;
}

export function combatDamageMultiplier(
  profile: AuthoritativeCombatProfile,
  kind: AttackKind,
  requested?: CombatStatCategory,
): number {
  return statDamageMultiplier(profile.stats, combatCategoryFor(profile, kind, requested));
}

interface ProfileRow {
  level: number | null;
  combat: number | null;
  vitality: number | null;
  blade: number | null;
  ranged: number | null;
  fruit_power: number | null;
  mana: number | null;
  metadata_json: unknown;
}

/**
 * Reads only Server-owned progression/equipment rows. The short cache prevents a
 * database query for every combo hit while allowing a newly persisted allocation
 * to affect authority within one second.
 */
export class PostgresCombatProfileProvider implements CombatProfileProvider {
  private readonly cache = new Map<string, {
    expiresAt: number;
    value: AuthoritativeCombatProfile;
  }>();

  constructor(
    private readonly pool: Pool,
    private readonly now: () => number = () => Date.now(),
    private readonly cacheTtlMs = 1_000,
  ) {}

  async profile(characterId: string): Promise<AuthoritativeCombatProfile> {
    const cached = this.cache.get(characterId);
    const now = this.now();
    if (cached && cached.expiresAt > now) return cached.value;

    const result = await this.pool.query<ProfileRow>(
      `select c.level, p.combat, p.vitality, p.blade, p.ranged, p.fruit_power, p.mana,
              e.metadata_json
         from characters c
         left join player_progression p on p.character_id = c.id
         left join player_equipment e on e.character_id = c.id and e.slot = 'state'
        where c.id = $1
        limit 1`,
      [characterId],
    );
    const row = result.rows[0];
    if (!row) return defaultCombatProfile();

    const stats: CharacterStats = {
      combat: stat(row.combat),
      vitality: stat(row.vitality),
      blade: stat(row.blade),
      ranged: stat(row.ranged),
      fruitPower: stat(row.fruit_power),
      mana: stat(row.mana),
    };
    const metadata = record(row.metadata_json);
    const loadout = record(metadata.inventoryLoadout);
    const legacyLoadout = record(metadata.legacyLoadout);
    const legacySlots = record(legacyLoadout.slots);
    const hasInventoryLoadout = Object.keys(loadout).length > 0;
    const legacyActive = legacyLoadout.activeCategory;
    const equippedWeapon = hasInventoryLoadout
      ? weaponCategory(loadout.equippedWeaponKind)
      : weaponCategory(
          legacyActive === 'sword' || legacyActive === 'gun' ? legacyActive : 'fighting-style',
        );
    const equippedFruitId = hasInventoryLoadout
      ? loadout.equippedFruitId
      : legacySlots.fruit;
    const hasFruit = typeof equippedFruitId === 'string' && equippedFruitId.length > 0;
    const activeSkillCategory: CombatStatCategory =
      (
        hasInventoryLoadout
          ? loadout.activeSet === 'fruit'
          : legacyActive === 'fruit'
      ) && hasFruit
        ? 'fruit'
        : equippedWeapon;
    const allowedSkillCategories: CombatStatCategory[] = hasFruit
      ? [equippedWeapon, 'fruit']
      : [equippedWeapon];
    const value: AuthoritativeCombatProfile = {
      level: typeof row.level === 'number' && Number.isFinite(row.level)
        ? Math.max(1, Math.floor(row.level))
        : 1,
      stats,
      ...resourceCapsForStats(stats),
      weaponCategory: equippedWeapon,
      activeSkillCategory,
      allowedSkillCategories,
    };
    this.cache.set(characterId, {
      expiresAt: now + Math.max(0, this.cacheTtlMs),
      value,
    });
    return value;
  }

  invalidate(characterId: string): void {
    this.cache.delete(characterId);
  }
}
