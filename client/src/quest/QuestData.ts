export type QuestObjectiveType = 'kill' | 'boss' | 'collect' | 'talk';

export interface QuestObjective {
  type: QuestObjectiveType;
  targetId: string;
  requiredAmount: number;
}

export interface QuestReward {
  playerExp: number;
  coins: number;
  masteryBonus?: number;
}

export interface QuestDefinition {
  id: string;
  name: string;
  description: string;
  minimumLevel: number;
  repeatable: boolean;
  objectives: QuestObjective[];
  rewards: QuestReward;
}

export interface ActiveQuest {
  definition: QuestDefinition;
  progress: number[];
  completed: boolean;
}

export interface QuestAcceptResult {
  accepted: boolean;
  reason?:
    | 'not-found'
    | 'level-too-low'
    | 'already-completed'
    | 'already-active'
    | 'replace-confirmation';
  requiredLevel?: number;
}

export interface QuestClaimResult {
  claimed: boolean;
  reason?: 'no-active-quest' | 'not-complete';
}
