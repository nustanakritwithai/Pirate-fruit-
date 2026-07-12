import { PROGRESSION_CONFIG } from '../progression/ProgressionData';
import { getExpRequiredForLevel } from '../progression/LevelSystem';
import type { ProgressionManager } from '../progression/ProgressionManager';

/** HUD ขนาดเล็กสำหรับ Level / EXP / Coins; อัปเดตจาก event เท่านั้น */
export class ProgressionHUD {
  private readonly root: HTMLDivElement;
  private readonly level: HTMLSpanElement;
  private readonly exp: HTMLSpanElement;
  private readonly coins: HTMLSpanElement;
  private readonly fill: HTMLDivElement;

  constructor(private progression: ProgressionManager) {
    const style = document.createElement('style');
    style.textContent = `
      .progression-hud { position:fixed; z-index:18; left:16px; top:168px; width:146px;
        box-sizing:border-box; padding:8px 10px; pointer-events:none; color:#f5fbff;
        background:linear-gradient(145deg,rgba(5,24,34,.8),rgba(12,48,58,.72));
        border:1px solid rgba(127,218,231,.36); border-radius:11px; box-shadow:0 4px 14px rgba(0,0,0,.3);
        font:700 11px 'Segoe UI',Tahoma,sans-serif; text-shadow:0 1px 2px #000; }
      .progression-hud-head { display:flex; align-items:center; justify-content:space-between; gap:6px; }
      .progression-hud-level { color:#ffdf7f; font-size:13px; }
      .progression-hud-coins { color:#ffe49a; font-size:10px; }
      .progression-exp-track { height:5px; margin-top:6px; overflow:hidden; border-radius:4px;
        background:rgba(0,0,0,.48); border:1px solid rgba(255,255,255,.18); }
      .progression-exp-fill { height:100%; width:0; border-radius:3px; transition:width .35s ease;
        background:linear-gradient(90deg,#56d5ef,#82f0c2); }
      .progression-exp-text { margin-top:3px; color:#b8d9df; font-size:9px; text-align:right; }
      .progression-hud.level-up { animation:progression-level-flash .8s ease; }
      @keyframes progression-level-flash { 0%,100%{box-shadow:0 4px 14px rgba(0,0,0,.3)}
        35%{border-color:#ffe27a;box-shadow:0 0 24px rgba(255,221,94,.9);transform:scale(1.04)} }
      @media(max-width:700px){ .progression-hud{top:136px;left:10px;width:132px;padding:6px 8px}
        .progression-hud-coins{display:none} }
    `;
    document.head.appendChild(style);

    this.root = document.createElement('div');
    this.root.className = 'progression-hud';
    this.root.innerHTML = `
      <div class="progression-hud-head"><span class="progression-hud-level"></span>
        <span class="progression-hud-coins"></span></div>
      <div class="progression-exp-track"><div class="progression-exp-fill"></div></div>
      <div class="progression-exp-text"></div>`;
    document.body.appendChild(this.root);
    this.level = this.root.querySelector('.progression-hud-level')!;
    this.exp = this.root.querySelector('.progression-exp-text')!;
    this.coins = this.root.querySelector('.progression-hud-coins')!;
    this.fill = this.root.querySelector('.progression-exp-fill')!;

    progression.events.on('player:exp-gained', () => this.render());
    progression.events.on('coins:changed', () => this.render());
    progression.events.on('player:level-up', () => {
      this.render();
      this.root.classList.remove('level-up');
      requestAnimationFrame(() => this.root.classList.add('level-up'));
    });
    this.render();
  }

  private render(): void {
    const { player, coins } = this.progression.getState();
    const atCap = player.level >= PROGRESSION_CONFIG.maxLevel;
    const required = atCap ? 1 : getExpRequiredForLevel(player.level);
    this.level.textContent = `Lv.${player.level}`;
    this.exp.textContent = atCap ? 'MAX LEVEL' : `${player.exp} / ${required} EXP`;
    this.coins.textContent = `🪙 ${coins}`;
    this.fill.style.width = `${atCap ? 100 : Math.min(100, (player.exp / required) * 100)}%`;
  }
}
