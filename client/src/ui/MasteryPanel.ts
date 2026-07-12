import { SKILLS } from '../combat/CombatData';
import { getMasteryExpRequired } from '../progression/MasterySystem';
import type { ProgressionManager } from '../progression/ProgressionManager';
import type { ActiveLoadoutItem } from '../progression/ProgressionTypes';

export class MasteryPanel {
  private readonly root: HTMLDivElement;
  private lastItemId = '';

  constructor(
    private progression: ProgressionManager,
    private getActiveItem: () => ActiveLoadoutItem,
  ) {
    const style = document.createElement('style');
    style.textContent = `
      .mastery-panel { position:fixed; z-index:17; left:16px; top:238px; width:146px; box-sizing:border-box;
        padding:7px 9px; pointer-events:none; color:#eefbff; background:rgba(5,23,33,.72);
        border:1px solid rgba(169,126,239,.34); border-radius:10px; box-shadow:0 3px 12px rgba(0,0,0,.25);
        font:700 9px 'Segoe UI',Tahoma,sans-serif; text-shadow:0 1px 2px #000; }
      .mastery-name { color:#d9c3ff; font-size:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .mastery-level { margin-top:3px; color:#fff; }
      .mastery-exp { color:#aebec5; font-size:8px; }
      .mastery-skills { display:none; margin-top:5px; color:#93b6bd; line-height:1.45; }
      .mastery-panel:hover .mastery-skills { display:block; }
      @media(max-width:700px){.mastery-panel{left:10px;top:197px;width:132px;padding:6px 8px}.mastery-skills{display:none!important}}
    `;
    document.head.appendChild(style);
    this.root = document.createElement('div');
    this.root.className = 'mastery-panel';
    document.body.appendChild(this.root);
    progression.events.on('mastery:exp-gained', ({ itemId }) => {
      if (itemId === this.getActiveItem().itemId) this.render();
    });
    progression.events.on('mastery:level-up', ({ itemId }) => {
      if (itemId === this.getActiveItem().itemId) this.render();
    });
    this.render();
  }

  update(): void {
    const itemId = this.getActiveItem().itemId;
    if (itemId !== this.lastItemId) this.render();
  }

  private render(): void {
    const item = this.getActiveItem();
    this.lastItemId = item.itemId;
    const entry = this.progression.getState().mastery[item.itemId];
    const level = entry?.level ?? 1;
    const exp = entry?.exp ?? 0;
    const required = getMasteryExpRequired(level);
    const itemSkills = SKILLS.filter((skill) => skill.category === item.category);
    const skillLines = itemSkills.length > 0 ? itemSkills.map((skill, index) => {
      const unlocked = level >= skill.masteryRequired;
      return `<div>${unlocked ? '✓' : '🔒'} Skill ${index + 1} — ${
        unlocked ? 'ปลดล็อกแล้ว' : `Mastery ${skill.masteryRequired}`
      }</div>`;
    }).join('') : '<div>ยังไม่มีสกิลสำหรับอุปกรณ์ชิ้นนี้</div>';
    this.root.innerHTML = `<div class="mastery-name">${item.name}</div>
      <div class="mastery-level">Mastery ${level}</div>
      <div class="mastery-exp">EXP ${exp} / ${required}</div>
      <div class="mastery-skills">${skillLines}</div>`;
  }
}
