import { PROGRESSION_CONFIG } from './ProgressionData';
import type { LevelUpResult, PlayerProgression } from './ProgressionTypes';

/** EXP ต่อเลเวล — สูตร Blox Fruits Wiki: floor(2 × level^2.3 + 84) */
export function getExpRequiredForLevel(level: number): number {
  const safeLevel = Math.max(1, Math.floor(Number.isFinite(level) ? level : 1));
  return Math.floor(2 * safeLevel ** 2.3 + 84);
}

/** Pure progression operation; UI และ combat ไม่ควรคำนวณ level เอง */
export function applyPlayerExp(player: PlayerProgression, amount: number): LevelUpResult {
  const previousLevel = player.level;
  if (!Number.isFinite(amount) || amount <= 0 || player.level >= PROGRESSION_CONFIG.maxLevel) {
    return {
      previousLevel,
      newLevel: player.level,
      levelsGained: 0,
      statPointsGained: 0,
      remainingExp: player.exp,
    };
  }

  player.exp += Math.floor(amount);
  let levelsGained = 0;
  while (player.level < PROGRESSION_CONFIG.maxLevel) {
    const required = getExpRequiredForLevel(player.level);
    if (player.exp < required) break;
    player.exp -= required;
    player.level++;
    levelsGained++;
  }

  if (player.level >= PROGRESSION_CONFIG.maxLevel) player.exp = 0;
  const statPointsGained = levelsGained * PROGRESSION_CONFIG.statPointsPerLevel;
  player.statPoints += statPointsGained;

  return {
    previousLevel,
    newLevel: player.level,
    levelsGained,
    statPointsGained,
    remainingExp: player.exp,
  };
}
