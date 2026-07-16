export type LoadoutCategory = 'style' | 'sword' | 'gun' | 'fruit' | 'utility';

export interface PlayerStats {
  combat: number;
  vitality: number;
  blade: number;
  ranged: number;
  fruitPower: number;
  mana: number;
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
  activeQuestProgress: number[];
}
