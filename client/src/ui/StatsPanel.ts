import type { ProgressionManager } from '../progression/ProgressionManager';
import type { ActiveLoadoutItem, PlayerStatId } from '../progression/ProgressionTypes';
import { PROGRESSION_CONFIG } from '../progression/ProgressionData';
import { getMasteryExpRequired } from '../progression/MasterySystem';
import { listSkillGates, SKILL_LOCK_ENABLED } from '../combat/SkillLoadout';
import {
  STAT_DEFINITIONS,
  STATS_SYSTEM_CONFIG,
  countMaxedStats,
} from '../stats/StatsRegistry';
import type { BloxStatId } from '../stats/types';

/** แมป Blox stat → หมวดดาเมจใน combat (defense ไม่มีดาเมจ) */
const BLOX_TO_CATEGORY: Record<BloxStatId, 'style' | 'sword' | 'gun' | 'fruit' | null> = {
  melee: 'style',
  defense: null,
  sword: 'sword',
  gun: 'gun',
  fruit: 'fruit',
  mana: null,
};

export class StatsPanel {
  private readonly root: HTMLDivElement;
  private readonly content: HTMLDivElement;
  private readonly openButton: HTMLButtonElement;
  private openState = false;

  constructor(
    private progression: ProgressionManager,
    private onVisibilityChanged: (open: boolean) => void,
    /** ไอเทมที่ติดตั้งแยกต่อชิ้น (อาวุธ + ผลไม้) เพื่อโชว์ mastery ต่อชิ้น */
    private getMasteryItems: () => ActiveLoadoutItem[],
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
        <header><div><h2>สเตตัส (Stats)</h2><p class="stats-summary"></p></div>
          <button class="stats-close" type="button" aria-label="ปิด">×</button></header>
        <div class="stats-panel-content"></div>
        <footer>อ้างอิง Blox Fruits Wiki · สูงสุด ${STATS_SYSTEM_CONFIG.maxStatsFullyMaxed} สเตต ที่ ${STATS_SYSTEM_CONFIG.maxPointsPerStat} แต้ม (ดาเมจ ~${STATS_SYSTEM_CONFIG.damageMultiplierAtMax}x)</footer>
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
    progression.events.on('mastery:exp-gained', () => this.render());
    progression.events.on('mastery:level-up', () => this.render());
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

  /** ผลลัพธ์สด ๆ ของสเตตัสหนึ่ง (ตามสูตร wiki) เพื่อโชว์ในแถว */
  private liveEffect(stat: (typeof STAT_DEFINITIONS)[number], value: number): string {
    const points = Math.max(0, value - 1);
    if (stat.id === 'defense') {
      return `+${points * PROGRESSION_CONFIG.healthPerVitality} HP`;
    }
    if (stat.id === 'mana') {
      return `+${points * PROGRESSION_CONFIG.manaPerMana} MP`;
    }
    if (stat.id === 'melee') {
      const mult = this.progression.getDamageMultiplier('style');
      return `+${points * PROGRESSION_CONFIG.energyPerCombat} Energy · ดาเมจหมัด ${mult.toFixed(2)}x`;
    }
    const category = BLOX_TO_CATEGORY[stat.id];
    const mult = category ? this.progression.getDamageMultiplier(category) : 1;
    return `ดาเมจ ${mult.toFixed(2)}x`;
  }

  private render(): void {
    const state = this.progression.getState();
    const cap = PROGRESSION_CONFIG.maxStatPerCategory;
    const maxedCount = countMaxedStats(state.player.stats as unknown as Record<string, number>);

    const summary = this.root.querySelector<HTMLParagraphElement>('.stats-summary')!;
    summary.textContent =
      `Lv.${state.player.level}/${PROGRESSION_CONFIG.maxLevel} · ${state.player.statPoints} แต้ม · ` +
      `max แล้ว ${maxedCount}/${STATS_SYSTEM_CONFIG.maxStatsFullyMaxed}`;

    this.content.innerHTML = '';
    for (const stat of STAT_DEFINITIONS) {
      const internalId = stat.internalId as PlayerStatId;
      const value = state.player.stats[internalId];
      const row = document.createElement('div');
      row.className = 'stats-row';
      row.innerHTML = `
        <div class="stats-row-head">
          <span class="stats-name">${stat.nameTh} <em>${stat.name}</em></span>
          <strong>${value}<span>/${cap}</span></strong>
          <button type="button" data-stat="${internalId}" aria-label="เพิ่ม ${stat.nameTh}">+</button>
        </div>
        <div class="stats-effect">${this.liveEffect(stat, value)}</div>
        <div class="stats-desc">${stat.description}</div>`;
      row.querySelector('button')!.toggleAttribute(
        'disabled',
        state.player.statPoints <= 0 || value >= cap,
      );
      this.content.appendChild(row);
    }

    const derived = document.createElement('div');
    derived.className = 'stats-derived';
    derived.textContent =
      `Max HP ${this.progression.getMaxHp()} · Max MP ${this.progression.getMaxMp()} · ` +
      `Max Energy ${this.progression.getMaxEnergy()}`;
    this.content.appendChild(derived);

    // Mastery แยกต่อชิ้น — โชว์อาวุธที่ถือ + ผลไม้พร้อมกัน (แต่ละชิ้นเก็บเลเวลของตัวเอง)
    const heading = document.createElement('div');
    heading.className = 'stats-mastery-heading';
    heading.textContent = 'ความชำนาญ (Mastery) — แยกต่อชิ้น';
    this.content.appendChild(heading);

    const ICON: Record<string, string> = { style: '👊', sword: '🗡️', gun: '🔫', fruit: '🍎' };
    for (const item of this.getMasteryItems()) {
      const mastery = state.mastery[item.itemId];
      const masteryLevel = mastery?.level ?? 1;
      const masteryExp = mastery?.exp ?? 0;
      const masteryRequired = getMasteryExpRequired(masteryLevel);
      const progress = Math.min(100, Math.round((masteryExp / masteryRequired) * 100));
      // สถานะปลดล็อกต่อสกิล (Z/X/C/V) — ✓ ปลดแล้ว / 🔒 เกณฑ์ mastery
      const gates = listSkillGates(item.category, item.itemId)
        .map((g) => {
          const unlocked = !SKILL_LOCK_ENABLED || masteryLevel >= g.masteryRequired;
          const cls = unlocked ? 'skill-gate unlocked' : 'skill-gate locked';
          const tag = unlocked ? '✓' : `🔒${g.masteryRequired}`;
          return `<li class="${cls}"><span class="gate-key">${g.key}</span> ${g.name} <span class="gate-tag">${tag}</span></li>`;
        })
        .join('');
      const section = document.createElement('section');
      section.className = 'stats-mastery';
      section.innerHTML = `
        <div class="stats-mastery-title">${ICON[item.category] ?? '⚔️'} ${item.name}</div>
        <div class="stats-mastery-level">Mastery ${masteryLevel}<span>/${PROGRESSION_CONFIG.masteryMaxLevel}</span></div>
        <div class="stats-mastery-bar"><i style="width:${progress}%"></i></div>
        <div class="stats-mastery-exp">EXP ${masteryExp} / ${masteryRequired}</div>
        ${gates ? `<ul class="stats-skill-gates">${gates}</ul>` : ''}`;
      this.content.appendChild(section);
    }
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
      .stats-panel { width:min(480px,100%); max-height:88vh; overflow:auto; color:#eef9fa;
        border:1px solid rgba(255,218,120,.48); border-radius:17px; padding:17px;
        background:linear-gradient(145deg,#092635,#123e47); box-shadow:0 16px 50px rgba(0,0,0,.55); }
      .stats-panel header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
      .stats-panel h2 { margin:0; color:#ffe08a; font-size:20px; }
      .stats-summary { margin:4px 0 13px; color:#a8cbd1; font-size:11px; }
      .stats-close { border:0; background:transparent; color:#d9e9eb; font-size:27px; cursor:pointer; }
      .stats-row { margin:8px 0; padding:10px 12px; border-radius:12px; background:rgba(3,18,27,.5);
        border:1px solid rgba(125,203,216,.18); }
      .stats-row-head { display:grid; grid-template-columns:1fr auto 34px; align-items:center; gap:9px; }
      .stats-name { font-size:14px; font-weight:700; color:#e9f7f9; }
      .stats-name em { color:#7fb6c2; font-style:normal; font-size:11px; font-weight:600; }
      .stats-row-head strong { color:#8ce5f0; font-size:13px; text-align:right; white-space:nowrap; }
      .stats-row-head strong span { color:#5f8892; font-size:10px; font-weight:600; }
      .stats-row-head button { width:32px; height:28px; border:0; border-radius:9px; color:#17282d;
        background:#ffdb78; font-size:18px; font-weight:900; cursor:pointer; }
      .stats-row-head button:disabled { opacity:.35; cursor:not-allowed; }
      .stats-effect { margin-top:6px; color:#8ff0cd; font-size:12px; font-weight:700; }
      .stats-desc { margin-top:3px; color:#93b0b7; font-size:10px; line-height:1.45; }
      .stats-derived { margin-top:12px; color:#9fe6cc; font-size:12px; text-align:center; font-weight:700; }
      .stats-mastery-heading { margin:16px 0 4px; color:#dec5ff; font-size:12px; font-weight:800; }
      .stats-mastery { margin-top:8px; padding:10px 11px; border-radius:11px; background:rgba(28,15,48,.42);
        border:1px solid rgba(169,126,239,.34); }
      .stats-mastery-title { color:#f0e4ff; font-weight:800; font-size:13px; }
      .stats-mastery-level { margin-top:3px; color:#fff; font-size:13px; font-weight:800; }
      .stats-mastery-level span { color:#9a86b8; font-size:10px; font-weight:600; }
      .stats-mastery-bar { margin-top:5px; height:6px; border-radius:4px; background:rgba(0,0,0,.35); overflow:hidden; }
      .stats-mastery-bar i { display:block; height:100%; border-radius:4px;
        background:linear-gradient(90deg,#b98cff,#e8c2ff); }
      .stats-mastery-exp { margin-top:4px; color:#b8c5ce; font-size:10px; }
      .stats-skill-gates { list-style:none; margin:7px 0 0; padding:0; display:flex; flex-direction:column; gap:3px; }
      .skill-gate { display:flex; align-items:center; gap:6px; font-size:11px; padding:3px 7px; border-radius:7px;
        background:rgba(0,0,0,.28); }
      .skill-gate .gate-key { display:inline-flex; min-width:16px; height:16px; align-items:center; justify-content:center;
        border-radius:4px; font-size:9px; font-weight:900; background:rgba(255,255,255,.14); }
      .skill-gate .gate-tag { margin-left:auto; font-weight:800; font-size:10px; }
      .skill-gate.unlocked { color:#9ff0cd; } .skill-gate.unlocked .gate-tag { color:#6fe6a8; }
      .skill-gate.locked { color:#c7a3a3; } .skill-gate.locked .gate-tag { color:#ff9d8a; }
      .stats-panel footer { margin-top:12px; color:#82a5ac; font-size:10px; text-align:center; }
      @media(max-width:700px){ .stats-open-button{right:8px;top:88px;width:30px;height:30px;font-size:14px}
        .stats-panel-root{align-items:flex-end;padding:8px}.stats-panel{max-height:80vh} }
    `;
    document.head.appendChild(style);
  }
}
