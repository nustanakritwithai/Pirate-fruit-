import type { ProgressionManager } from '../progression/ProgressionManager';
import type { PlayerStatId } from '../progression/ProgressionTypes';
import { PROGRESSION_CONFIG } from '../progression/ProgressionData';

const STAT_LABELS: Record<PlayerStatId, string> = {
  combat: 'Combat',
  vitality: 'Vitality',
  blade: 'Blade',
  ranged: 'Ranged',
  fruitPower: 'Fruit Power',
};

export class StatsPanel {
  private readonly root: HTMLDivElement;
  private readonly content: HTMLDivElement;
  private readonly openButton: HTMLButtonElement;
  private openState = false;

  constructor(
    private progression: ProgressionManager,
    private onVisibilityChanged: (open: boolean) => void,
  ) {
    this.injectStyles();
    this.openButton = document.createElement('button');
    this.openButton.className = 'stats-open-button';
    this.openButton.type = 'button';
    this.openButton.title = 'Stats (K)';
    this.openButton.textContent = '📊';
    this.openButton.addEventListener('click', () => this.toggle());
    document.body.appendChild(this.openButton);

    this.root = document.createElement('div');
    this.root.className = 'stats-panel-root';
    this.root.innerHTML = `
      <section class="stats-panel" role="dialog" aria-label="Player Stats">
        <header><div><h2>Player Stats</h2><p class="stats-summary"></p></div>
          <button class="stats-close" type="button" aria-label="ปิด">×</button></header>
        <div class="stats-panel-content"></div>
        <footer>Damage จาก Stat จะคูณหลัง Base Damage และ Combo ของ Combat</footer>
      </section>`;
    document.body.appendChild(this.root);
    this.content = this.root.querySelector('.stats-panel-content')!;
    this.root.querySelector<HTMLButtonElement>('.stats-close')!.addEventListener('click', () => this.close());
    this.root.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-stat]');
      if (!button) return;
      this.progression.spendStatPoint(button.dataset.stat as PlayerStatId);
      this.render();
    });
    window.addEventListener('keydown', (event) => {
      if (event.code === 'KeyK' && !event.repeat) this.toggle();
      if (event.code === 'Escape' && this.openState) this.close();
    });
    progression.events.on('player:stat-spent', () => this.render());
    progression.events.on('player:level-up', () => this.render());
    this.root.style.display = 'none';
  }

  open(): void {
    if (this.openState) return;
    if (document.pointerLockElement) document.exitPointerLock();
    this.openState = true;
    this.root.style.display = 'flex';
    this.render();
    this.onVisibilityChanged(true);
  }

  close(): void {
    if (!this.openState) return;
    this.openState = false;
    this.root.style.display = 'none';
    this.onVisibilityChanged(false);
  }

  private toggle(): void {
    if (this.openState) this.close();
    else this.open();
  }

  private render(): void {
    const state = this.progression.getState();
    const summary = this.root.querySelector<HTMLParagraphElement>('.stats-summary')!;
    summary.textContent = `Lv.${state.player.level} · ${state.player.exp} EXP · ${state.player.statPoints} Stat Points`;
    this.content.innerHTML = '';
    for (const [statId, label] of Object.entries(STAT_LABELS) as [PlayerStatId, string][]) {
      const row = document.createElement('div');
      row.className = 'stats-row';
      row.innerHTML = `<span>${label}</span><strong>${state.player.stats[statId]}</strong>
        <button type="button" data-stat="${statId}" aria-label="เพิ่ม ${label}">+</button>`;
      row.querySelector('button')!.toggleAttribute(
        'disabled',
        state.player.statPoints <= 0 ||
          state.player.stats[statId] >= PROGRESSION_CONFIG.maxStatPerCategory,
      );
      this.content.appendChild(row);
    }
    const derived = document.createElement('div');
    derived.className = 'stats-derived';
    derived.textContent = `Max HP ${this.progression.getMaxHp()} · Max Energy ${this.progression.getMaxEnergy()}`;
    this.content.appendChild(derived);
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      .stats-open-button { position:fixed; z-index:31; right:16px; top:86px; width:38px; height:38px;
        border:1px solid rgba(255,222,135,.5); border-radius:50%; color:#fff; background:rgba(5,30,42,.76);
        box-shadow:0 3px 12px rgba(0,0,0,.35); cursor:pointer; font-size:17px; touch-action:manipulation; }
      .stats-panel-root { position:fixed; inset:0; z-index:78; display:flex; align-items:center; justify-content:center;
        padding:14px; box-sizing:border-box; background:rgba(1,10,18,.62); backdrop-filter:blur(5px);
        font-family:'Segoe UI',Tahoma,sans-serif; }
      .stats-panel { width:min(460px,100%); color:#eef9fa; border:1px solid rgba(255,218,120,.48);
        border-radius:17px; padding:17px; background:linear-gradient(145deg,#092635,#123e47);
        box-shadow:0 16px 50px rgba(0,0,0,.55); }
      .stats-panel header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
      .stats-panel h2 { margin:0; color:#ffe08a; font-size:20px; }
      .stats-summary { margin:4px 0 13px; color:#a8cbd1; font-size:11px; }
      .stats-close { border:0; background:transparent; color:#d9e9eb; font-size:27px; cursor:pointer; }
      .stats-row { display:grid; grid-template-columns:1fr 45px 38px; align-items:center; gap:9px;
        margin:7px 0; padding:9px 11px; border-radius:11px; background:rgba(3,18,27,.5);
        border:1px solid rgba(125,203,216,.18); font-size:13px; }
      .stats-row strong { color:#8ce5f0; text-align:center; }
      .stats-row button { width:32px; height:28px; border:0; border-radius:9px; color:#17282d;
        background:#ffdb78; font-size:18px; font-weight:900; cursor:pointer; }
      .stats-row button:disabled { opacity:.35; cursor:not-allowed; }
      .stats-derived { margin-top:12px; color:#9fe6cc; font-size:12px; text-align:center; }
      .stats-panel footer { margin-top:12px; color:#82a5ac; font-size:10px; text-align:center; }
      @media(max-width:700px){ .stats-open-button{right:10px;top:91px;width:34px;height:34px}
        .stats-panel-root{align-items:flex-end;padding:8px}.stats-panel{max-height:74vh;overflow:auto} }
    `;
    document.head.appendChild(style);
  }
}
