import type { ProgressionManager } from '../progression/ProgressionManager';
import type { ActiveLoadoutItem } from '../progression/ProgressionTypes';
import type { ActiveQuest, QuestAcceptResult, QuestClaimResult } from './QuestData';
import { QUESTS_BY_ID } from './QuestDefinitions';
import { createActiveQuest, isQuestComplete } from './QuestProgress';
import type { RemoteQuestSync } from './RemoteQuestSync';

/** Quest framework เล็กและแยกจาก MonsterManager; รับ monster:killed และ trade:completed */
export class QuestManager {
  /** S10: ตัวประสานกับ Server — เมื่อ set แล้ว รางวัลแจกจากคำตอบ Server เท่านั้น */
  private remoteSync: RemoteQuestSync | null = null;

  constructor(
    private progression: ProgressionManager,
    private getActiveItem: () => ActiveLoadoutItem | null,
  ) {
    progression.events.on('monster:killed', ({ monsterId, isBoss }) => {
      this.recordKill(monsterId, isBoss);
    });
    progression.events.on('trade:completed', ({ action, islandId, commodityId, quantity }) => {
      if (action === 'sell') this.recordDeliver(commodityId, islandId, quantity);
    });
  }

  get events() {
    return this.progression.events;
  }

  get isRemote(): boolean {
    return this.remoteSync !== null;
  }

  setRemoteSync(sync: RemoteQuestSync | null): void {
    this.remoteSync = sync;
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
    this.remoteSync?.notifyAccepted(questId, replaceActive);
    return { accepted: true };
  }

  abandonQuest(): void {
    this.progression.setActiveQuest(null);
    this.remoteSync?.notifyAbandoned();
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

    let reported = false;
    let displayChanged = false;
    active.definition.objectives.forEach((objective, index) => {
      const typeMatches = objective.type === 'kill' || (objective.type === 'boss' && isBoss);
      if (!typeMatches || objective.targetId !== monsterId) return;
      const next = Math.min(objective.requiredAmount, active.progress[index] + 1);
      if (next === active.progress[index]) return;
      reported = true;
      const displayNext = this.remoteSync && next >= objective.requiredAmount
        ? Math.max(0, objective.requiredAmount - 1)
        : next;
      if (displayNext === active.progress[index]) return;
      active.progress[index] = displayNext;
      displayChanged = true;
      this.progression.events.emit('quest:progress', {
        questId: active.definition.id,
        objectiveIndex: index,
        current: displayNext,
        required: objective.requiredAmount,
      });
    });

    if (!reported) return;
    if (displayChanged) this.progression.setQuestProgress(active.progress);
    this.remoteSync?.notifyKill(monsterId, isBoss);
    if (displayChanged) this.finishIfComplete(active);
  }

  recordDeliver(commodityId: string, islandId: string, quantity: number): void {
    const active = this.getActiveQuest();
    if (!active || active.completed) return;

    let reported = false;
    let displayChanged = false;
    active.definition.objectives.forEach((objective, index) => {
      if (objective.type !== 'deliver') return;
      if (objective.targetId !== commodityId) return;
      if (objective.islandId && objective.islandId !== islandId) return;
      const next = Math.min(objective.requiredAmount, active.progress[index] + quantity);
      if (next === active.progress[index]) return;
      reported = true;
      const displayNext = this.remoteSync && next >= objective.requiredAmount
        ? Math.max(0, objective.requiredAmount - 1)
        : next;
      if (displayNext === active.progress[index]) return;
      active.progress[index] = displayNext;
      displayChanged = true;
      this.progression.events.emit('quest:progress', {
        questId: active.definition.id,
        objectiveIndex: index,
        current: displayNext,
        required: objective.requiredAmount,
      });
    });

    if (!reported) return;
    if (displayChanged) this.progression.setQuestProgress(active.progress);
    this.remoteSync?.notifyDeliver(commodityId, islandId, quantity);
    if (displayChanged) this.finishIfComplete(active);
  }

  /** โหมด remote: ครบแล้วรอ Server ยืนยัน+เคลม; โหมด local: แจกรางวัลทันทีตามเดิม */
  private finishIfComplete(active: ActiveQuest): void {
    if (!isQuestComplete(active.definition, active.progress)) return;
    // Remote quests deliberately stay in the completed/ready-to-turn-in state.
    // The server already owns this state; claiming is an explicit Quest Board
    // action so a full objective is never mistaken for a fresh quest.
    if (this.remoteSync) this.remoteSync.notifyCompleted(active.definition.id);
    else this.claimQuestReward();
  }

  claimQuestReward(): QuestClaimResult {
    const active = this.getActiveQuest();
    if (!active) return { claimed: false, reason: 'no-active-quest' };
    if (!active.completed) return { claimed: false, reason: 'not-complete' };
    if (this.remoteSync) {
      // Server เป็นผู้แจก — คิว claim ไว้ (applyServerClaim จะปิดเควสต์เมื่อสำเร็จ)
      this.remoteSync.requestClaim(active.definition.id);
      return { claimed: false, reason: 'pending-server' };
    }
    this.grantRewards(active.definition.id, {
      playerExp: active.definition.rewards.playerExp,
      coins: active.definition.rewards.coins,
      masteryBonus: active.definition.rewards.masteryBonus ?? 0,
    });
    return { claimed: true };
  }

  // ---- ส่วนที่ RemoteQuestSync (S10) เรียกกลับ ----

  getLocalActive(): { questId: string; progress: number[] } | null {
    const active = this.getActiveQuest();
    return active ? { questId: active.definition.id, progress: [...active.progress] } : null;
  }

  /** ตั้งสถานะ local ตาม Server (reconcile) — ไม่แจกรางวัล ไม่ emit accepted */
  forceState(questId: string | null, progress: number[]): void {
    this.progression.setActiveQuest(questId, progress);
    const definition = questId ? QUESTS_BY_ID.get(questId) : undefined;
    if (!definition || !questId) return;
    definition.objectives.forEach((objective, index) => {
      this.progression.events.emit('quest:progress', {
        questId,
        objectiveIndex: index,
        current: Math.min(objective.requiredAmount, Math.max(0, Math.floor(progress[index] ?? 0))),
        required: objective.requiredAmount,
      });
    });
  }

  /** progress ทางการจาก Server มาทับ (เงียบ — UI อ่านจาก getActiveQuest ตามรอบ) */
  syncServerProgress(questId: string, progress: number[]): void {
    const state = this.progression.getState();
    if (state.activeQuestId !== questId) return;
    const previous = state.activeQuestProgress;
    this.progression.setQuestProgress(progress);
    const definition = QUESTS_BY_ID.get(questId);
    definition?.objectives.forEach((objective, index) => {
      const current = Math.min(objective.requiredAmount, Math.max(0, Math.floor(progress[index] ?? 0)));
      if (current === (previous[index] ?? 0)) return;
      this.progression.events.emit('quest:progress', {
        questId,
        objectiveIndex: index,
        current,
        required: objective.requiredAmount,
      });
    });
  }

  /** รางวัลที่ Server ตัดสิน (โหมด remote) */
  applyServerClaim(
    questId: string,
    rewards: { playerExp: number; coins: number; masteryBonus: number },
  ): void {
    const state = this.progression.getState();
    if (state.activeQuestId !== questId) return;
    this.grantRewards(questId, rewards);
  }

  private grantRewards(
    questId: string,
    rewards: { playerExp: number; coins: number; masteryBonus: number },
  ): void {
    const definition = QUESTS_BY_ID.get(questId);
    if (!definition) return;
    const activeItem = this.getActiveItem();
    this.progression.addPlayerExp(rewards.playerExp, `quest:${questId}`);
    this.progression.addCoins(rewards.coins, `quest:${questId}`);
    if (activeItem && rewards.masteryBonus > 0) {
      this.progression.addMasteryExp(activeItem.itemId, activeItem.category, rewards.masteryBonus);
    }
    this.progression.markQuestCompleted(questId);
    this.progression.events.emit('quest:completed', {
      questId,
      name: definition.name,
      playerExp: rewards.playerExp,
      coins: rewards.coins,
      masteryBonus: rewards.masteryBonus,
    });
    this.progression.save();
  }
}
