import { applyExpToProgress, expRequiredForLevel } from '@pirate-fruit/shared';
import { PROGRESSION_CONFIG } from './ProgressionData';
import type { LevelUpResult, PlayerProgression } from './ProgressionTypes';

/**
 * EXP ต่อเลเวล — สูตร Blox Fruits Wiki: floor(2 × level^2.3 + 84)
 * S12: ตัวสูตรจริงอยู่ shared (Server ใช้เดินเลเวลด้วยสูตรเดียวกันเป๊ะ)
 */
export function getExpRequiredForLevel(level: number): number {
  return expRequiredForLevel(level);
}

/** Pure progression operation; UI และ combat ไม่ควรคำนวณ level เอง */
export function applyPlayerExp(player: PlayerProgression, amount: number): LevelUpResult {
  const previousLevel = player.level;
  const walked = applyExpToProgress({ level: player.level, exp: player.exp }, amount);
  player.level = walked.level;
  player.exp = walked.exp;
  const statPointsGained = walked.levelsGained * PROGRESSION_CONFIG.statPointsPerLevel;
  player.statPoints += statPointsGained;
  return {
    previousLevel,
    newLevel: player.level,
    levelsGained: walked.levelsGained,
    statPointsGained,
    remainingExp: player.exp,
  };
}
