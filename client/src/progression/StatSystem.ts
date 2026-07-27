import { PROGRESSION_CONFIG } from './ProgressionData';
import type {
  LoadoutCategory,
  PlayerProgression,
  PlayerStatId,
  PlayerStats,
} from './ProgressionTypes';
import {
  resourceCapsForStats,
  statDamageMultiplier,
  type CombatStatCategory,
} from '@pirate-fruit/shared';

export const PLAYER_STAT_IDS: readonly PlayerStatId[] = [
  'combat',
  'vitality',
  'blade',
  'ranged',
  'fruitPower',
  'mana',
];

export function isPlayerStatId(value: unknown): value is PlayerStatId {
  return typeof value === 'string' && PLAYER_STAT_IDS.includes(value as PlayerStatId);
}

export function getMaxHp(stats: PlayerStats): number {
  return resourceCapsForStats(stats).maxHp;
}

export function getMaxEnergy(stats: PlayerStats): number {
  return resourceCapsForStats(stats).maxEnergy;
}

export function getMaxMp(stats: PlayerStats): number {
  return resourceCapsForStats(stats).maxMp;
}

export function getRelevantStat(category: LoadoutCategory): PlayerStatId | null {
  if (category === 'style') return 'combat';
  if (category === 'sword') return 'blade';
  if (category === 'gun') return 'ranged';
  if (category === 'fruit') return 'fruitPower';
  return null;
}

export function getStatDamageMultiplier(stats: PlayerStats, category: LoadoutCategory): number {
  const statId = getRelevantStat(category);
  if (!statId) return 1;
  return statDamageMultiplier(stats, category as CombatStatCategory);
}

export function spendStatPoint(
  player: PlayerProgression,
  statId: PlayerStatId,
  amount = 1,
): boolean {
  if (!isPlayerStatId(statId) || !Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    return false;
  }
  if (player.statPoints < amount) return false;
  if (player.stats[statId] + amount > PROGRESSION_CONFIG.maxStatPerCategory) return false;

  player.statPoints -= amount;
  player.stats[statId] += amount;
  return true;
}
