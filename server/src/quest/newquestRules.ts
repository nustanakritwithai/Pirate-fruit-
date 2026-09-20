import {
  QUEST_PROGRESS_MAX_AMOUNT,
  isQuestObjectivesComplete,
  type QuestDefinition,
  type QuestProgressEventPayload,
} from '@pirate-fruit/shared';
import { applyExpToProgress, type LevelWalkResult } from '@pirate-fruit/shared';

export interface QuestTransitionState {
  questId: string | null;
  status: 'active' | 'completed' | 'claimed' | 'abandoned' | null;
  progress: number[];
}

export interface QuestProgressTransition {
  progress: number[];
  completed: boolean;
}

export interface QuestRewardTransition {
  progress: LevelWalkResult;
  coinsTotal: number;
  playerExp: number;
  coins: number;
  masteryBonus: number;
}

export function zeroQuestProgress(definition: QuestDefinition): number[] {
  return definition.objectives.map(() => 0);
}

export function normalizeQuestProgress(
  definition: QuestDefinition,
  raw: unknown,
): number[] {
  const values = Array.isArray(raw) ? raw : [];
  return definition.objectives.map((objective, index) => {
    const value = values[index];
    const count = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 0;
    return Math.min(objective.requiredAmount, Math.max(0, count));
  });
}

function matches(event: QuestProgressEventPayload, objective: QuestDefinition['objectives'][number]): boolean {
  if (objective.targetId !== event.targetId) return false;
  if (event.kind === 'kill') {
    return objective.type === 'kill' || (objective.type === 'boss' && event.isBoss === true);
  }
  return objective.type === 'deliver' && (!objective.islandId || objective.islandId === event.islandId);
}

export function applyQuestProgress(
  definition: QuestDefinition,
  current: readonly number[],
  events: readonly QuestProgressEventPayload[],
): QuestProgressTransition {
  const progress = normalizeQuestProgress(definition, current);
  for (const event of events) {
    const amount = Math.min(QUEST_PROGRESS_MAX_AMOUNT, Math.max(0, Math.floor(event.amount)));
    if (amount <= 0) continue;
    definition.objectives.forEach((objective, index) => {
      if (matches(event, objective)) progress[index] = Math.min(objective.requiredAmount, progress[index]! + amount);
    });
  }
  return { progress, completed: isQuestObjectivesComplete(definition, progress) };
}

export function acceptQuest(
  definition: QuestDefinition,
  current: QuestTransitionState,
  level: number,
  replaceActive: boolean,
): { questId: string; progress: number[]; abandonedQuestId: string | null } {
  if (level < definition.minimumLevel) throw new Error('LEVEL_TOO_LOW');
  if (current.questId === definition.id && (current.status === 'active' || current.status === 'completed')) {
    throw new Error('QUEST_ALREADY_ACTIVE');
  }
  if (current.questId && (current.status === 'active' || current.status === 'completed') && !replaceActive) {
    throw new Error('ACTIVE_QUEST_CONFLICT');
  }
  if (!definition.repeatable && current.questId === definition.id && current.status === 'claimed') {
    throw new Error('QUEST_NOT_REPEATABLE');
  }
  return {
    questId: definition.id,
    progress: zeroQuestProgress(definition),
    abandonedQuestId: current.questId && (current.status === 'active' || current.status === 'completed') ? current.questId : null,
  };
}

export function abandonQuest(current: QuestTransitionState): QuestTransitionState {
  return { questId: current.questId, status: current.questId ? 'abandoned' : null, progress: [...current.progress] };
}

export function calculateQuestReward(
  definition: QuestDefinition,
  level: number,
  exp: number,
  coins: number,
): QuestRewardTransition {
  const reward = definition.rewards;
  const walked = applyExpToProgress({ level, exp }, reward.playerExp);
  return {
    progress: walked,
    coinsTotal: coins + reward.coins,
    playerExp: reward.playerExp,
    coins: reward.coins,
    masteryBonus: reward.masteryBonus ?? 0,
  };
}
