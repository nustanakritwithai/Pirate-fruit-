import { PROGRESSION_CONFIG } from './ProgressionData';
import type {
  LoadoutCategory,
  PlayerProgression,
  PlayerStatId,
  PlayerStats,
} from './ProgressionTypes';

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
  return (
    PROGRESSION_CONFIG.baseHealth +
    (Math.max(1, stats.vitality) - 1) * PROGRESSION_CONFIG.healthPerVitality
  );
}

export function getMaxEnergy(stats: PlayerStats): number {
  return (
    PROGRESSION_CONFIG.baseEnergy +
    (Math.max(1, stats.combat) - 1) * PROGRESSION_CONFIG.energyPerCombat
  );
}

export function getMaxMp(stats: PlayerStats): number {
  return (
    PROGRESSION_CONFIG.baseMana +
    (Math.max(1, stats.mana) - 1) * PROGRESSION_CONFIG.manaPerMana
  );
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
  return 1 + (Math.max(1, stats[statId]) - 1) * PROGRESSION_CONFIG.damagePerStatPoint;
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
