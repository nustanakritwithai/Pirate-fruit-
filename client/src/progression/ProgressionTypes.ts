export type PlayerStatId = 'combat' | 'vitality' | 'blade' | 'ranged' | 'fruitPower';

export type LoadoutCategory = 'style' | 'sword' | 'gun' | 'fruit' | 'utility';

export interface PlayerStats {
  combat: number;
  vitality: number;
  blade: number;
  ranged: number;
  fruitPower: number;
}

export interface PlayerProgression {
  level: number;
  exp: number;
  statPoints: number;
  stats: PlayerStats;
}

export interface MasteryEntry {
  itemId: string;
  category: LoadoutCategory;
  level: number;
  exp: number;
}

export interface ProgressionState {
  player: PlayerProgression;
  mastery: Record<string, MasteryEntry>;
  coins: number;
  completedQuestIds: string[];
  activeQuestId: string | null;
  /** จำนวนที่ทำได้ของ objective แต่ละข้อในเควสปัจจุบัน */
  activeQuestProgress: number[];
}

export interface LevelUpResult {
  previousLevel: number;
  newLevel: number;
  levelsGained: number;
  statPointsGained: number;
  remainingExp: number;
}

export interface MasteryLevelUpResult {
  itemId: string;
  previousLevel: number;
  newLevel: number;
  levelsGained: number;
  remainingExp: number;
}

export interface EnemyRewardDefinition {
  playerExp: number;
  masteryExp: number;
  coins: number;
}

export interface ItemMasteryReward {
  itemId: string;
  category: LoadoutCategory;
  amount: number;
}

export interface RewardContribution {
  enemyId: string;
  totalDamage: number;
  lastHitItemId: string | null;
  lastHitCategory: LoadoutCategory | null;
  highestDamageItemId: string | null;
  highestDamageCategory: LoadoutCategory | null;
  killed: boolean;
}

export interface RewardEnemy {
  id: string;
  level: number;
  isBoss: boolean;
  reward: EnemyRewardDefinition;
}

export interface GrantedReward {
  playerExp: number;
  coins: number;
  mastery: ItemMasteryReward[];
  multiplier: number;
}

export interface SkillRequirement {
  id: string;
  name: string;
  masteryRequired: number;
}

export interface ActiveLoadoutItem {
  itemId: string;
  category: LoadoutCategory;
  name: string;
}

/** Economy ชุดเดียวที่ระบบเรือและระบบอื่นใช้ร่วมกัน */
export interface EconomyWallet {
  readonly coins: number;
  spendCoins(amount: number, source?: string): boolean;
  addCoins(amount: number, source?: string): void;
}

export interface PlayerResourceAdapter {
  applyProgressionCaps(
    maxHp: number,
    maxEnergy: number,
    mode: 'clamp' | 'preserve-delta' | 'full',
  ): void;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
