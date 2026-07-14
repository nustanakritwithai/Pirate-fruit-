import type { Updatable } from '../engine/Game';
import { PROGRESSION_CONFIG } from './ProgressionData';
import { ProgressionEvents } from './ProgressionEvents';
import { applyPlayerExp } from './LevelSystem';
import { applyMasteryExp, canUseSkill as masteryAllowsSkill, createMasteryEntry } from './MasterySystem';
import { browserStorage, loadProgression, saveProgression } from './ProgressionSave';
import { grantEnemyRewards as grantRewards } from './RewardSystem';
import {
  getMaxEnergy,
  getMaxHp,
  getMaxMp,
  getStatDamageMultiplier,
  spendStatPoint as applyStatPoint,
} from './StatSystem';
import type {
  GrantedReward,
  LoadoutCategory,
  MasteryLevelUpResult,
  PlayerResourceAdapter,
  PlayerStatId,
  ProgressionState,
  RewardContribution,
  RewardEnemy,
  SkillRequirement,
  StorageLike,
  LevelUpResult,
} from './ProgressionTypes';

export interface ProgressionManagerOptions {
  storage?: StorageLike | null;
  resources?: PlayerResourceAdapter;
}

/** Entry point กลางของ Phase 6; combat, UI และ quest ใช้ API นี้เท่านั้น */
export class ProgressionManager implements Updatable {
  readonly events = new ProgressionEvents();
  private readonly storage: StorageLike | null;
  private readonly resources?: PlayerResourceAdapter;
  private readonly skillRequirements = new Map<string, SkillRequirement[]>();
  private state: ProgressionState;
  private autosaveElapsed = 0;
  private dirty = false;

  constructor(options: ProgressionManagerOptions = {}) {
    this.storage = options.storage === undefined ? browserStorage() : options.storage;
    this.resources = options.resources;
    this.state = loadProgression(this.storage);
    this.resources?.applyProgressionCaps(this.getMaxHp(), this.getMaxEnergy(), this.getMaxMp(), 'clamp');
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', () => this.save());
  }

  get level(): number {
    return this.state.player.level;
  }

  get coins(): number {
    return this.state.coins;
  }

  getState(): Readonly<ProgressionState> {
    return this.state;
  }

  addPlayerExp(amount: number, source?: string): LevelUpResult {
    const granted = Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : 0;
    const result = applyPlayerExp(this.state.player, granted);
    if (granted > 0) {
      this.dirty = true;
      this.events.emit('player:exp-gained', {
        amount: granted,
        source,
        currentExp: this.state.player.exp,
      });
    }
    if (result.levelsGained > 0) {
      this.resources?.applyProgressionCaps(this.getMaxHp(), this.getMaxEnergy(), this.getMaxMp(), 'full');
      this.events.emit('player:level-up', {
        oldLevel: result.previousLevel,
        newLevel: result.newLevel,
        statPointsGained: result.statPointsGained,
      });
      this.save();
    }
    return result;
  }

  addMasteryExp(
    itemId: string,
    category: LoadoutCategory,
    amount: number,
  ): MasteryLevelUpResult {
    const safeItemId = itemId.trim();
    const entry = this.state.mastery[safeItemId] ?? createMasteryEntry(safeItemId, category);
    this.state.mastery[safeItemId] = entry;
    const granted = Number.isFinite(amount) && amount > 0 ? Math.floor(amount) : 0;
    const result = applyMasteryExp(entry, granted);
    if (granted > 0) {
      this.dirty = true;
      this.events.emit('mastery:exp-gained', {
        itemId: safeItemId,
        category,
        amount: granted,
        currentExp: entry.exp,
      });
    }
    if (result.levelsGained > 0) {
      this.events.emit('mastery:level-up', {
        itemId: safeItemId,
        oldLevel: result.previousLevel,
        newLevel: result.newLevel,
      });
      for (const skill of this.skillRequirements.get(safeItemId) ?? []) {
        if (
          skill.masteryRequired > result.previousLevel &&
          skill.masteryRequired <= result.newLevel
        ) {
          this.events.emit('skill:unlocked', {
            itemId: safeItemId,
            skillId: skill.id,
            skillName: skill.name,
            masteryRequired: skill.masteryRequired,
          });
        }
      }
    }
    return result;
  }

  addCoins(amount: number, source?: string): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const granted = Math.floor(amount);
    this.state.coins += granted;
    this.dirty = true;
    this.events.emit('coins:changed', { amount: granted, total: this.state.coins, source });
  }

  spendCoins(amount: number, source?: string): boolean {
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) return false;
    if (this.state.coins < amount) return false;
    this.state.coins -= amount;
    this.dirty = true;
    this.events.emit('coins:changed', { amount: -amount, total: this.state.coins, source });
    this.save();
    return true;
  }

  spendStatPoint(statId: PlayerStatId, amount = 1): boolean {
    const oldMaxHp = this.getMaxHp();
    const oldMaxEnergy = this.getMaxEnergy();
    const oldMaxMp = this.getMaxMp();
    if (!applyStatPoint(this.state.player, statId, amount)) return false;

    const maxHp = this.getMaxHp();
    const maxEnergy = this.getMaxEnergy();
    const maxMp = this.getMaxMp();
    this.resources?.applyProgressionCaps(maxHp, maxEnergy, maxMp, 'preserve-delta');
    this.dirty = true;
    this.events.emit('player:stat-spent', {
      statId,
      amount,
      newValue: this.state.player.stats[statId],
    });
    if (maxHp !== oldMaxHp || maxEnergy !== oldMaxEnergy || maxMp !== oldMaxMp) {
      this.events.emit('player:stats-changed', { maxHp, maxEnergy, maxMp });
    }
    this.save();
    return true;
  }

  getDamageMultiplier(category: LoadoutCategory): number {
    return getStatDamageMultiplier(this.state.player.stats, category);
  }

  getMaxHp(): number {
    return getMaxHp(this.state.player.stats);
  }

  getMaxEnergy(): number {
    return getMaxEnergy(this.state.player.stats);
  }

  getMaxMp(): number {
    return getMaxMp(this.state.player.stats);
  }

  getMasteryLevel(itemId: string): number {
    return this.state.mastery[itemId]?.level ?? 1;
  }

  canUseSkill(itemId: string, skill: SkillRequirement): boolean {
    return masteryAllowsSkill(this.getMasteryLevel(itemId), skill);
  }

  notifySkillLocked(itemId: string, skill: SkillRequirement): void {
    this.events.emit('skill:locked', {
      itemId,
      skillId: skill.id,
      skillName: skill.name,
      masteryRequired: skill.masteryRequired,
    });
  }

  registerSkillRequirements(itemId: string, skills: readonly SkillRequirement[]): void {
    this.skillRequirements.set(itemId, [...skills]);
  }

  grantEnemyRewards(enemy: RewardEnemy, contribution: RewardContribution): GrantedReward {
    const reward = grantRewards(this, enemy, contribution);
    if (reward.playerExp > 0 || reward.coins > 0 || reward.mastery.length > 0) {
      this.events.emit('reward:granted', reward);
      this.save();
    }
    return reward;
  }

  setActiveQuest(questId: string | null, progress: number[] = []): void {
    this.state.activeQuestId = questId;
    this.state.activeQuestProgress = questId ? [...progress] : [];
    this.dirty = true;
    this.save();
  }

  setQuestProgress(progress: number[]): void {
    if (!this.state.activeQuestId) return;
    this.state.activeQuestProgress = progress.map((count) => Math.max(0, Math.floor(count)));
    this.dirty = true;
  }

  markQuestCompleted(questId: string): void {
    if (!this.state.completedQuestIds.includes(questId)) this.state.completedQuestIds.push(questId);
    this.setActiveQuest(null);
  }

  update(dt: number): void {
    this.autosaveElapsed += dt * 1000;
    if (this.dirty && this.autosaveElapsed >= PROGRESSION_CONFIG.autosaveIntervalMs) this.save();
  }

  save(): void {
    saveProgression(this.storage, this.state);
    this.dirty = false;
    this.autosaveElapsed = 0;
  }
}
