/**
 * Shared character-stat formulas.
 *
 * Both browser prediction/local play and Server authority must use this module.
 * Keeping the formulas here prevents an allocated stat from changing the UI while
 * authoritative PvE/PvP continues to use an unrelated constant.
 */

export const MAX_PLAYER_STAT = 2_800;
export const BASE_PLAYER_HP = 100;
export const BASE_PLAYER_ENERGY = 100;
export const BASE_PLAYER_MP = 100;
export const HP_PER_VITALITY = 5;
export const ENERGY_PER_COMBAT = 5;
export const MP_PER_MANA = 5;
export const DAMAGE_MULTIPLIER_AT_MAX_STAT = 78.26;
export const DAMAGE_PER_STAT_POINT =
  (DAMAGE_MULTIPLIER_AT_MAX_STAT - 1) / MAX_PLAYER_STAT;

export type CombatStatCategory = 'style' | 'sword' | 'gun' | 'fruit';

export interface CharacterStats {
  combat: number;
  vitality: number;
  blade: number;
  ranged: number;
  fruitPower: number;
  mana: number;
}

export interface CharacterResourceCaps {
  maxHp: number;
  maxEnergy: number;
  maxMp: number;
}

function normalizedStat(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(MAX_PLAYER_STAT, Math.floor(value)));
}

export function resourceCapsForStats(stats: CharacterStats): CharacterResourceCaps {
  return {
    maxHp: BASE_PLAYER_HP + (normalizedStat(stats.vitality) - 1) * HP_PER_VITALITY,
    maxEnergy:
      BASE_PLAYER_ENERGY + (normalizedStat(stats.combat) - 1) * ENERGY_PER_COMBAT,
    maxMp: BASE_PLAYER_MP + (normalizedStat(stats.mana) - 1) * MP_PER_MANA,
  };
}

export function statForCombatCategory(
  stats: CharacterStats,
  category: CombatStatCategory,
): number {
  if (category === 'style') return normalizedStat(stats.combat);
  if (category === 'sword') return normalizedStat(stats.blade);
  if (category === 'gun') return normalizedStat(stats.ranged);
  return normalizedStat(stats.fruitPower);
}

export function statDamageMultiplier(
  stats: CharacterStats,
  category: CombatStatCategory,
): number {
  return 1 + (statForCombatCategory(stats, category) - 1) * DAMAGE_PER_STAT_POINT;
}

export function scaledStatDamage(
  baseDamage: number,
  stats: CharacterStats,
  category: CombatStatCategory,
): number {
  const safeBase = Number.isFinite(baseDamage) ? Math.max(0, baseDamage) : 0;
  if (safeBase <= 0) return 0;
  return Math.max(1, Math.round(safeBase * statDamageMultiplier(stats, category)));
}
