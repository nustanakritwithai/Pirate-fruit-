import type { ProgressionManager } from '../progression/ProgressionManager';
import type { ActiveLoadoutItem } from '../progression/ProgressionTypes';
import type { ActiveQuest, QuestAcceptResult, QuestClaimResult } from './QuestData';
import { QUESTS_BY_ID } from './QuestDefinitions';
import { createActiveQuest, isQuestComplete } from './QuestProgress';

/** Quest framework เล็กและแยกจาก MonsterManager; รับเฉพาะ monster:killed event */
export class QuestManager {
  constructor(
    private progression: ProgressionManager,
    private getActiveItem: () => ActiveLoadoutItem | null,
  ) {
    progression.events.on('monster:killed', ({ monsterId, isBoss }) => {
      this.recordKill(monsterId, isBoss);
    });
  }

  get events() {
    return this.progression.events;
  }

  acceptQuest(questId: string, replaceActive = false): QuestAcceptResult {
    const quest = QUESTS_BY_ID.get(questId);
    if (!quest) return { accepted: false, reason: 'not-found' };
    if (this.progression.level < quest.minimumLevel) {
      return { accepted: false, reason: 'level-too-low', requiredLevel: quest.minimumLevel };
    }
    const state = this.progression.getState();
    if (state.activeQuestId === questId) return { accepted: false, reason: 'already-active' };
    if (!quest.repeatable && state.completedQuestIds.includes(questId)) {
      return { accepted: false, reason: 'already-completed' };
    }
    if (state.activeQuestId && state.activeQuestId !== questId && !replaceActive) {
      return { accepted: false, reason: 'replace-confirmation' };
    }

    this.progression.setActiveQuest(questId, quest.objectives.map(() => 0));
    this.progression.events.emit('quest:accepted', { questId, name: quest.name });
    return { accepted: true };
  }

  abandonQuest(): void {
    this.progression.setActiveQuest(null);
  }

  getActiveQuest(): ActiveQuest | null {
    const state = this.progression.getState();
    if (!state.activeQuestId) return null;
    const definition = QUESTS_BY_ID.get(state.activeQuestId);
    return definition ? createActiveQuest(definition, state.activeQuestProgress) : null;
  }

  recordKill(monsterId: string, isBoss: boolean): void {
    const active = this.getActiveQuest();
    if (!active || active.completed) return;

    let changed = false;
    active.definition.objectives.forEach((objective, index) => {
      const typeMatches = objective.type === 'kill' || (objective.type === 'boss' && isBoss);
      if (!typeMatches || objective.targetId !== monsterId) return;
      const next = Math.min(objective.requiredAmount, active.progress[index] + 1);
      if (next === active.progress[index]) return;
      active.progress[index] = next;
      changed = true;
      this.progression.events.emit('quest:progress', {
        questId: active.definition.id,
        objectiveIndex: index,
        current: next,
        required: objective.requiredAmount,
      });
    });

    if (!changed) return;
    this.progression.setQuestProgress(active.progress);
    if (isQuestComplete(active.definition, active.progress)) this.claimQuestReward();
  }

  claimQuestReward(): QuestClaimResult {
    const active = this.getActiveQuest();
    if (!active) return { claimed: false, reason: 'no-active-quest' };
    if (!active.completed) return { claimed: false, reason: 'not-complete' };

    const { rewards } = active.definition;
    const activeItem = this.getActiveItem();
    this.progression.addPlayerExp(rewards.playerExp, `quest:${active.definition.id}`);
    this.progression.addCoins(rewards.coins, `quest:${active.definition.id}`);
    const masteryBonus = rewards.masteryBonus ?? 0;
    if (activeItem && masteryBonus > 0) {
      this.progression.addMasteryExp(activeItem.itemId, activeItem.category, masteryBonus);
    }
    this.progression.markQuestCompleted(active.definition.id);
    this.progression.events.emit('quest:completed', {
      questId: active.definition.id,
      name: active.definition.name,
      playerExp: rewards.playerExp,
      coins: rewards.coins,
      masteryBonus,
    });
    this.progression.save();
    return { claimed: true };
  }
}
