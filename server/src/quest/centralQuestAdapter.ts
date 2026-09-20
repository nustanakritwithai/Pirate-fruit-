import {
  QUEST_PROTOCOL_SCHEMA_VERSION,
  QUESTS_BY_ID,
  STAT_POINTS_PER_LEVEL,
  type QuestProgressEventPayload,
  type QuestStateResponse,
} from '@pirate-fruit/shared';
import type { CanonicalPlayerState } from '../player/playerState.js';
import { applyCanonicalMasteryExp } from '../player/centralRewardAdapter.js';
import {
  acceptQuest,
  applyQuestProgress,
  calculateQuestReward,
  type QuestTransitionState,
} from './newquestRules.js';

export interface CentralQuestOutcome<T> {
  state: CanonicalPlayerState;
  result: T;
}

export interface CentralQuestClaimResult {
  ok: true;
  schemaVersion: typeof QUEST_PROTOCOL_SCHEMA_VERSION;
  questId: string;
  playerExp: number;
  coins: number;
  masteryBonus: number;
  coinsTotal: number;
  idempotentReplay: boolean;
}

function clone(state: CanonicalPlayerState): CanonicalPlayerState {
  return structuredClone(state);
}

function definitionOrThrow(questId: string) {
  const definition = QUESTS_BY_ID.get(questId);
  if (!definition) throw new Error('QUEST_NOT_FOUND');
  return definition;
}

function transitionState(state: CanonicalPlayerState): QuestTransitionState {
  const questId = state.progression.activeQuestId;
  return {
    questId,
    status: questId ? 'active' : null,
    progress: state.progression.activeQuestProgress,
  };
}

/** Pure canonical projection of the original QuestService rules. No database or reward formula is duplicated. */
export class CentralQuestAdapter {
  state(current: CanonicalPlayerState): QuestStateResponse {
    const state = clone(current);
    const questId = state.progression.activeQuestId;
    const definition = questId ? QUESTS_BY_ID.get(questId) : undefined;
    const completed = definition
      ? applyQuestProgress(definition, state.progression.activeQuestProgress, []).completed
      : false;
    const active = definition && questId
      ? {
          questId,
          progress: [...state.progression.activeQuestProgress],
          status: completed ? 'completed' as const : 'active' as const,
        }
      : null;
    return {
      ok: true,
      schemaVersion: QUEST_PROTOCOL_SCHEMA_VERSION,
      active,
      completedQuestIds: [...state.progression.completedQuestIds],
    };
  }

  accept(
    current: CanonicalPlayerState,
    questId: string,
    replaceActive = false,
  ): CentralQuestOutcome<{ ok: true; schemaVersion: typeof QUEST_PROTOCOL_SCHEMA_VERSION; questId: string; progress: number[] }> {
    const state = clone(current);
    const definition = definitionOrThrow(questId);
    if (state.progression.completedQuestIds.includes(questId) && !definition.repeatable) {
      throw new Error('QUEST_NOT_REPEATABLE');
    }
    const accepted = acceptQuest(definition, transitionState(state), state.progression.level, replaceActive);
    state.progression.activeQuestId = accepted.questId;
    state.progression.activeQuestProgress = [...accepted.progress];
    return { state, result: { ok: true, schemaVersion: QUEST_PROTOCOL_SCHEMA_VERSION, questId: accepted.questId, progress: [...accepted.progress] } };
  }

  abandon(current: CanonicalPlayerState): CentralQuestOutcome<{ ok: true }> {
    const state = clone(current);
    state.progression.activeQuestId = null;
    state.progression.activeQuestProgress = [];
    return { state, result: { ok: true } };
  }

  progress(
    current: CanonicalPlayerState,
    events: readonly QuestProgressEventPayload[],
  ): CentralQuestOutcome<{ ok: true; schemaVersion: typeof QUEST_PROTOCOL_SCHEMA_VERSION; questId: string | null; progress: number[]; completed: boolean }> {
    const state = clone(current);
    const questId = state.progression.activeQuestId;
    if (!questId) return { state, result: { ok: true, schemaVersion: QUEST_PROTOCOL_SCHEMA_VERSION, questId: null, progress: [], completed: false } };
    const definition = definitionOrThrow(questId);
    const outcome = applyQuestProgress(definition, state.progression.activeQuestProgress, events);
    state.progression.activeQuestProgress = [...outcome.progress];
    return { state, result: { ok: true, schemaVersion: QUEST_PROTOCOL_SCHEMA_VERSION, questId, progress: [...outcome.progress], completed: outcome.completed } };
  }

  claim(current: CanonicalPlayerState, questId: string): CentralQuestOutcome<CentralQuestClaimResult> {
    const state = clone(current);
    const definition = definitionOrThrow(questId);
    if (state.progression.activeQuestId !== questId) throw new Error('NO_ACTIVE_QUEST');
    const progress = applyQuestProgress(definition, state.progression.activeQuestProgress, []);
    if (!progress.completed) throw new Error('QUEST_NOT_COMPLETE');
    const reward = calculateQuestReward(
      definition,
      state.progression.level,
      state.progression.exp,
      state.progression.coins,
    );
    state.progression.level = reward.progress.level;
    state.progression.exp = reward.progress.exp;
    state.progression.statPoints += reward.progress.levelsGained * STAT_POINTS_PER_LEVEL;
    state.progression.coins = reward.coinsTotal;
    applyCanonicalMasteryExp(state, reward.masteryBonus);
    state.progression.completedQuestIds = [...new Set([...state.progression.completedQuestIds, questId])];
    state.progression.activeQuestId = null;
    state.progression.activeQuestProgress = [];
    return {
      state,
      result: {
        ok: true,
        schemaVersion: QUEST_PROTOCOL_SCHEMA_VERSION,
        questId,
        playerExp: reward.playerExp,
        coins: reward.coins,
        masteryBonus: reward.masteryBonus,
        coinsTotal: reward.coinsTotal,
        idempotentReplay: false,
      },
    };
  }
}
