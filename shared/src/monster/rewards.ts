/**
 * S11 — รางวัลจากมอนสเตอร์เป็นแหล่งเดียว (single source of truth)
 * สกัดจาก client/src/monster/MonsterData.ts — Server ใช้ตารางนี้คิดรางวัล
 * ห้ามแก้เลขฝั่งเกมโดยไม่อัปเดตที่นี่ (มี consistency test ฝั่ง client คุมไว้)
 */

export interface MonsterRewardEntry {
  level: number;
  isBoss: boolean;
  playerExp: number;
  masteryExp: number;
  coins: number;
}

export const MONSTER_REWARD_TABLE: Record<string, MonsterRewardEntry> = {
  'pirate-deckhand': { level: 9, isBoss: false, playerExp: 55, masteryExp: 30, coins: 22 },
  'pirate-captain': { level: 11, isBoss: false, playerExp: 150, masteryExp: 70, coins: 60 },
  'crab': { level: 2, isBoss: false, playerExp: 30, masteryExp: 18, coins: 12 },
  'grunt': { level: 4, isBoss: false, playerExp: 55, masteryExp: 30, coins: 24 },
  'boss': { level: 10, isBoss: true, playerExp: 300, masteryExp: 150, coins: 180 },
  'jungle-bandit': { level: 16, isBoss: false, playerExp: 120, masteryExp: 55, coins: 70 },
  'ruin-guardian': { level: 22, isBoss: false, playerExp: 210, masteryExp: 95, coins: 135 },
  'venom-ape-boss': { level: 28, isBoss: true, playerExp: 1000, masteryExp: 450, coins: 800 },
  'dune-scorpion': { level: 31, isBoss: false, playerExp: 260, masteryExp: 120, coins: 160 },
  'desert-raider': { level: 34, isBoss: false, playerExp: 310, masteryExp: 145, coins: 195 },
  'sand-golem': { level: 41, isBoss: false, playerExp: 430, masteryExp: 200, coins: 280 },
  'sun-guardian-boss': { level: 48, isBoss: true, playerExp: 1900, masteryExp: 800, coins: 1450 },
  'frost-crawler': { level: 51, isBoss: false, playerExp: 520, masteryExp: 235, coins: 340 },
  'frost-raider': { level: 55, isBoss: false, playerExp: 620, masteryExp: 280, coins: 420 },
  'crystal-golem': { level: 62, isBoss: false, playerExp: 820, masteryExp: 365, coins: 580 },
  'frost-king-boss': { level: 68, isBoss: true, playerExp: 2900, masteryExp: 1200, coins: 2300 },
  'cloud-crab': { level: 71, isBoss: false, playerExp: 980, masteryExp: 430, coins: 700 },
  'sky-raider': { level: 75, isBoss: false, playerExp: 1120, masteryExp: 500, coins: 820 },
  'storm-golem': { level: 82, isBoss: false, playerExp: 1450, masteryExp: 630, coins: 1080 },
  'tempest-lord-boss': { level: 88, isBoss: true, playerExp: 4300, masteryExp: 1750, coins: 3600 },
  'lava-crawler': { level: 91, isBoss: false, playerExp: 1720, masteryExp: 740, coins: 1320 },
  'ash-cultist': { level: 95, isBoss: false, playerExp: 1980, masteryExp: 850, coins: 1540 },
  'obsidian-golem': { level: 102, isBoss: false, playerExp: 2550, masteryExp: 1080, coins: 2050 },
  'magma-titan-boss': { level: 108, isBoss: true, playerExp: 6500, masteryExp: 2550, coins: 5400 },
};

/**
 * ตัวคูณรางวัลตามส่วนต่างเลเวล (ย้ายจาก client RewardSystem — สูตรเดิมเป๊ะ)
 * ตีมอนต่ำกว่าตัวมากรางวัลลด; บอส/เหรียญมีตัวคูณขั้นต่ำของตัวเอง
 */
export const REWARD_MULTIPLIER_CONFIG = {
  fullDifferenceMax: 5,
  reducedDifferenceMax: 10,
  lowDifferenceMax: 20,
  reducedMultiplier: 0.7,
  lowMultiplier: 0.4,
  minimumMultiplier: 0.2,
  bossMinimumMultiplier: 0.5,
  coinMinimumMultiplier: 0.5,
} as const;

export function levelRewardMultiplier(playerLevel: number, enemyLevel: number): number {
  const difference = Math.max(0, Math.floor(playerLevel) - Math.floor(enemyLevel));
  if (difference <= REWARD_MULTIPLIER_CONFIG.fullDifferenceMax) return 1;
  if (difference <= REWARD_MULTIPLIER_CONFIG.reducedDifferenceMax) {
    return REWARD_MULTIPLIER_CONFIG.reducedMultiplier;
  }
  if (difference <= REWARD_MULTIPLIER_CONFIG.lowDifferenceMax) {
    return REWARD_MULTIPLIER_CONFIG.lowMultiplier;
  }
  return REWARD_MULTIPLIER_CONFIG.minimumMultiplier;
}

export interface ComputedEnemyReward {
  playerExp: number;
  coins: number;
  masteryExp: number;
  multiplier: number;
}

/** เลขรางวัลสุดท้ายต่อการฆ่าหนึ่งครั้ง — client และ Server ต้องได้ค่าเท่ากันเป๊ะ */
export function computeEnemyReward(
  playerLevel: number,
  enemy: { level: number; isBoss: boolean; playerExp: number; masteryExp: number; coins: number },
): ComputedEnemyReward {
  const base = levelRewardMultiplier(playerLevel, enemy.level);
  const multiplier = enemy.isBoss
    ? Math.max(REWARD_MULTIPLIER_CONFIG.bossMinimumMultiplier, base)
    : base;
  const coinMultiplier = Math.max(REWARD_MULTIPLIER_CONFIG.coinMinimumMultiplier, multiplier);
  return {
    playerExp: Math.floor(enemy.playerExp * multiplier),
    masteryExp: Math.floor(enemy.masteryExp * multiplier),
    coins: Math.floor(enemy.coins * coinMultiplier),
    multiplier,
  };
}
