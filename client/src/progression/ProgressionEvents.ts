import type {
  GrantedReward,
  LoadoutCategory,
  PlayerStatId,
  RewardContribution,
} from './ProgressionTypes';

export interface ProgressionEventMap {
  'player:exp-gained': { amount: number; source?: string; currentExp: number };
  'player:level-up': { oldLevel: number; newLevel: number; statPointsGained: number };
  'player:stat-spent': { statId: PlayerStatId; amount: number; newValue: number };
  'player:stats-changed': { maxHp: number; maxEnergy: number; maxMp: number };
  'mastery:exp-gained': {
    itemId: string;
    category: LoadoutCategory;
    amount: number;
    currentExp: number;
  };
  'mastery:level-up': { itemId: string; oldLevel: number; newLevel: number };
  'skill:unlocked': { itemId: string; skillId: string; skillName: string; masteryRequired: number };
  'skill:locked': { itemId: string; skillId: string; skillName: string; masteryRequired: number };
  'reward:granted': GrantedReward;
  'coins:changed': { amount: number; total: number; source?: string };
  'quest:accepted': { questId: string; name: string };
  'quest:progress': { questId: string; objectiveIndex: number; current: number; required: number };
  'quest:completed': {
    questId: string;
    name: string;
    playerExp: number;
    coins: number;
    masteryBonus: number;
  };
  'monster:killed': {
    monsterId: string;
    monsterType: string;
    isBoss: boolean;
    position: { x: number; y: number; z: number };
    contribution: RewardContribution;
  };
  'trade:completed': {
    action: 'buy' | 'sell';
    islandId: string;
    commodityId: string;
    quantity: number;
  };
}

type Listener = (payload: unknown) => void;

/** Typed event bus เล็ก ๆ เพื่อให้ UI ไม่ต้อง poll state ทุกเฟรม */
export class ProgressionEvents {
  private readonly listeners = new Map<keyof ProgressionEventMap, Set<Listener>>();

  on<K extends keyof ProgressionEventMap>(
    event: K,
    listener: (payload: ProgressionEventMap[K]) => void,
  ): () => void {
    let listeners = this.listeners.get(event);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(event, listeners);
    }
    const wrapped: Listener = (payload) => listener(payload as ProgressionEventMap[K]);
    listeners.add(wrapped);
    return () => listeners?.delete(wrapped);
  }

  emit<K extends keyof ProgressionEventMap>(event: K, payload: ProgressionEventMap[K]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }
}
