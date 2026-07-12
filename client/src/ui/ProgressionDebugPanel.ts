import type { ProgressionManager } from '../progression/ProgressionManager';
import type { ActiveLoadoutItem } from '../progression/ProgressionTypes';
import type { QuestManager } from '../quest/QuestManager';
import { getExpRequiredForLevel } from '../progression/LevelSystem';

export class ProgressionDebugPanel {
  private readonly root: HTMLPreElement | null;
  private timer = 0;

  constructor(
    private progression: ProgressionManager,
    private quests: QuestManager,
    private getActiveItem: () => ActiveLoadoutItem,
  ) {
    if (new URLSearchParams(location.search).get('debugProgression') !== '1') {
      this.root = null;
      return;
    }
    this.root = document.createElement('pre');
    this.root.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:90;pointer-events:none;' +
      'margin:0;padding:9px;color:#9fffcf;background:rgba(0,0,0,.78);font:10px/1.4 monospace;border-radius:7px';
    document.body.appendChild(this.root);
    this.render();
  }

  update(dt: number): void {
    if (!this.root) return;
    this.timer += dt;
    if (this.timer < 0.5) return;
    this.timer = 0;
    this.render();
  }

  private render(): void {
    if (!this.root) return;
    const state = this.progression.getState();
    const item = this.getActiveItem();
    const mastery = state.mastery[item.itemId];
    this.root.textContent = [
      `Level ${state.player.level} · EXP ${state.player.exp}/${getExpRequiredForLevel(state.player.level)}`,
      `Stats ${JSON.stringify(state.player.stats)}`,
      `Item ${item.itemId} · Mastery ${mastery?.level ?? 1}`,
      `Damage x${this.progression.getDamageMultiplier(item.category).toFixed(3)}`,
      `Quest ${this.quests.getActiveQuest()?.definition.id ?? 'none'}`,
    ].join('\n');
  }
}
