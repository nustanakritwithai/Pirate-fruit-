import { PROGRESSION_CONFIG } from '../progression/ProgressionData';
import { getExpRequiredForLevel } from '../progression/LevelSystem';
import type { ProgressionManager } from '../progression/ProgressionManager';
import type { CharacterController } from '../player/CharacterController';

/** HUD ขนาดเล็กสำหรับ Level / EXP / Coins; อัปเดตจาก event เท่านั้น */
export class ProgressionHUD {
  private readonly root: HTMLDivElement;
  private readonly level: HTMLSpanElement;
  private readonly exp: HTMLSpanElement;
  private readonly coins: HTMLSpanElement;
  private readonly fill: HTMLDivElement;
  private readonly hpFill: HTMLDivElement;
  private readonly mpFill: HTMLDivElement;
  private readonly energyFill: HTMLDivElement;
  private readonly hpText: HTMLSpanElement;
  private readonly mpText: HTMLSpanElement;
  private readonly energyText: HTMLSpanElement;

  constructor(
    private progression: ProgressionManager,
    private controller: CharacterController,
  ) {
    const style = document.createElement('style');
    style.textContent = `
      .progression-hud { position:fixed; z-index:18; left:16px; top:168px; width:170px;
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
      .progression-vitals { margin-top:7px; display:grid; gap:4px; }
      .progression-vital { position:relative; height:8px; overflow:hidden; border-radius:5px;
        border:1px solid rgba(255,255,255,.24); background:rgba(0,0,0,.46); }
      .progression-vital-fill { height:100%; width:100%; transition:width .1s linear; }
      .progression-vital-label { position:absolute; inset:0; text-align:center; font-size:8px; line-height:8px;
        color:#fff; font-weight:700; text-shadow:0 1px 2px #000; }
      .progression-hp-fill { background:linear-gradient(90deg,#ff6b61,#d92f1f); }
      .progression-mp-fill { background:linear-gradient(90deg,#7aa8ff,#4a6ff0); }
      .progression-energy-fill { background:linear-gradient(90deg,#ffe77a,#e8b820); }
      .progression-hud.level-up { animation:progression-level-flash .8s ease; }
      @keyframes progression-level-flash { 0%,100%{box-shadow:0 4px 14px rgba(0,0,0,.3)}
        35%{border-color:#ffe27a;box-shadow:0 0 24px rgba(255,221,94,.9);transform:scale(1.04)} }
      @media(max-width:700px){ .progression-hud{top:136px;left:10px;width:154px;padding:7px 8px}
        .progression-hud-coins{display:none} }
    `;
    document.head.appendChild(style);

    this.root = document.createElement('div');
    this.root.className = 'progression-hud';
    this.root.innerHTML = `
      <div class="progression-hud-head"><span class="progression-hud-level"></span>
        <span class="progression-hud-coins"></span></div>
      <div class="progression-exp-track"><div class="progression-exp-fill"></div></div>
      <div class="progression-exp-text"></div>
      <div class="progression-vitals">
        <div class="progression-vital"><div class="progression-vital-fill progression-hp-fill"></div>
          <div class="progression-vital-label">HP <span class="progression-hp-text"></span></div></div>
        <div class="progression-vital"><div class="progression-vital-fill progression-mp-fill"></div>
          <div class="progression-vital-label">MP <span class="progression-mp-text"></span></div></div>
        <div class="progression-vital"><div class="progression-vital-fill progression-energy-fill"></div>
          <div class="progression-vital-label">Energy <span class="progression-energy-text"></span></div></div>
      </div>`;
    document.body.appendChild(this.root);
    this.level = this.root.querySelector('.progression-hud-level')!;
    this.exp = this.root.querySelector('.progression-exp-text')!;
    this.coins = this.root.querySelector('.progression-hud-coins')!;
    this.fill = this.root.querySelector('.progression-exp-fill')!;
    this.hpFill = this.root.querySelector('.progression-hp-fill')!;
    this.mpFill = this.root.querySelector('.progression-mp-fill')!;
    this.energyFill = this.root.querySelector('.progression-energy-fill')!;
    this.hpText = this.root.querySelector('.progression-hp-text')!;
    this.mpText = this.root.querySelector('.progression-mp-text')!;
    this.energyText = this.root.querySelector('.progression-energy-text')!;

    progression.events.on('player:exp-gained', () => this.render());
    progression.events.on('coins:changed', () => this.render());
    progression.events.on('player:level-up', () => {
      this.render();
      this.root.classList.remove('level-up');
      requestAnimationFrame(() => this.root.classList.add('level-up'));
    });
    this.render();
  }

  update(): void {
    const hpFraction = this.controller.hpMax > 0 ? this.controller.hp / this.controller.hpMax : 0;
    const mpFraction = this.controller.mpMax > 0 ? this.controller.mp / this.controller.mpMax : 0;
    const energyFraction = this.controller.energyMax > 0
      ? this.controller.energy / this.controller.energyMax
      : 0;
    this.hpFill.style.width = `${Math.max(0, Math.min(1, hpFraction)) * 100}%`;
    this.mpFill.style.width = `${Math.max(0, Math.min(1, mpFraction)) * 100}%`;
    this.energyFill.style.width = `${Math.max(0, Math.min(1, energyFraction)) * 100}%`;
    this.hpText.textContent = `${Math.round(this.controller.hp)}/${this.controller.hpMax}`;
    this.mpText.textContent = `${Math.round(this.controller.mp)}/${this.controller.mpMax}`;
    this.energyText.textContent = `${Math.round(this.controller.energy)}/${this.controller.energyMax}`;
  }

  private render(): void {
    const { player, coins } = this.progression.getState();
    const atCap = player.level >= PROGRESSION_CONFIG.maxLevel;
    const required = atCap ? 1 : getExpRequiredForLevel(player.level);
    this.level.textContent = `Lv.${player.level}`;
    this.exp.textContent = atCap ? 'MAX LEVEL' : `${player.exp} / ${required} EXP`;
    this.coins.textContent = `🪙 ${coins}`;
    this.fill.style.width = `${atCap ? 100 : Math.min(100, (player.exp / required) * 100)}%`;
    this.update();
  }
}
