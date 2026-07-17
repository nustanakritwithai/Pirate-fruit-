/**
 * S12 — สูตรเลเวลเป็นแหล่งเดียว (Blox Fruits Wiki: EXP to level up = floor(2×level^2.3 + 84))
 * Server ใช้เดินเลเวลจาก EXP ที่ตัวเองแจก (quest claim + monster kills) —
 * client LevelSystem delegate มาที่นี่ เพื่อให้สองฝั่งได้เลขเดียวกันเป๊ะ
 */

export const LEVEL_MAX = 2800 as const;

export function expRequiredForLevel(level: number): number {
  const safeLevel = Math.max(1, Math.floor(Number.isFinite(level) ? level : 1));
  return Math.floor(2 * safeLevel ** 2.3 + 84);
}

export interface LevelProgress {
  level: number;
  /** EXP สะสมภายในเลเวลปัจจุบัน (รีเซ็ตทุกครั้งที่เลเวลอัป — ตามโมเดลของเกม) */
  exp: number;
}

export interface LevelWalkResult extends LevelProgress {
  levelsGained: number;
}

/** เดินเลเวลจาก EXP ที่เพิ่ม — pure ใช้ร่วมทั้ง client และ Server */
export function applyExpToProgress(progress: LevelProgress, amount: number): LevelWalkResult {
  const level0 = Math.min(LEVEL_MAX, Math.max(1, Math.floor(progress.level) || 1));
  let level = level0;
  let exp = Math.max(0, Math.floor(progress.exp) || 0);
  const granted = Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : 0;
  if (granted <= 0 || level >= LEVEL_MAX) {
    return { level, exp: level >= LEVEL_MAX ? 0 : exp, levelsGained: 0 };
  }
  exp += granted;
  let levelsGained = 0;
  while (level < LEVEL_MAX) {
    const required = expRequiredForLevel(level);
    if (exp < required) break;
    exp -= required;
    level += 1;
    levelsGained += 1;
  }
  if (level >= LEVEL_MAX) exp = 0;
  return { level, exp, levelsGained };
}
