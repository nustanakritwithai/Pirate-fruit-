/** Mastery curve shared by client and every server-side canonical projection. */
export const MASTERY_MAX_LEVEL = 600 as const;

export interface MasteryProgressResult {
  itemId: string;
  previousLevel: number;
  newLevel: number;
  levelsGained: number;
  remainingExp: number;
}

export function getMasteryExpRequired(level: number): number {
  const safeLevel = Math.max(1, Math.floor(Number.isFinite(level) ? level : 1));
  return Math.floor(40 + safeLevel * 18 + safeLevel * safeLevel * 1.6);
}

export function applyMasteryExp(
  entry: { itemId: string; level: number; exp: number },
  amount: number,
  maxLevel: number = MASTERY_MAX_LEVEL,
): MasteryProgressResult {
  const previousLevel = entry.level;
  if (!Number.isFinite(amount) || amount <= 0 || entry.level >= maxLevel) {
    return { itemId: entry.itemId, previousLevel, newLevel: entry.level, levelsGained: 0, remainingExp: entry.exp };
  }
  entry.exp += Math.floor(amount);
  let levelsGained = 0;
  while (entry.level < maxLevel) {
    const required = getMasteryExpRequired(entry.level);
    if (entry.exp < required) break;
    entry.exp -= required;
    entry.level++;
    levelsGained++;
  }
  if (entry.level >= maxLevel) entry.exp = 0;
  return { itemId: entry.itemId, previousLevel, newLevel: entry.level, levelsGained, remainingExp: entry.exp };
}
