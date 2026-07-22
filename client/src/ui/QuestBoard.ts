import type { ProgressionManager } from '../progression/ProgressionManager';
import { QUEST_DEFINITIONS } from '../quest/QuestDefinitions';
import type { QuestManager } from '../quest/QuestManager';

export class QuestBoard {
  private readonly root: HTMLDivElement;
  private readonly cards: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private closeCallback: (() => void) | null = null;

  constructor(
    private quests: QuestManager,
    private progression: ProgressionManager,
  ) {
    this.injectStyles();
    this.root = document.createElement('div');
    this.root.className = 'quest-board-root';
    this.root.innerHTML = `<section class="quest-board"><header><div><h2>📜 กระดานภารกิจหมู่เกาะ</h2>
      <p>${this.quests.isRemote ? 'รับได้ครั้งละ 1 ภารกิจ · ทำครบแล้วกลับมาส่งเพื่อรับรางวัลจาก Server' : 'รับได้ครั้งละ 1 ภารกิจ · รางวัลเข้าทันทีเมื่อทำครบ'}</p></div>
      <button class="quest-board-close" type="button" aria-label="ปิด">×</button></header>
      <div class="quest-board-cards"></div><div class="quest-board-status"></div></section>`;
    document.body.appendChild(this.root);
    this.cards = this.root.querySelector('.quest-board-cards')!;
    this.status = this.root.querySelector('.quest-board-status')!;
    this.root.querySelector<HTMLButtonElement>('.quest-board-close')!.addEventListener('click', () => this.close());
    this.root.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-quest]');
      if (!button) return;
      this.accept(button.dataset.quest!);
    });
    this.quests.events.on('quest:progress', () => this.renderIfOpen());
    this.quests.events.on('quest:completed', () => this.renderIfOpen());
    window.addEventListener('keydown', (event) => {
      if (event.code === 'Escape' && this.root.style.display !== 'none') this.close();
    });
    this.root.style.display = 'none';
  }

  open(onClose: () => void): void {
    if (document.pointerLockElement) document.exitPointerLock();
    this.closeCallback = onClose;
    this.root.style.display = 'flex';
    this.status.textContent = '';
    this.render();
  }

  close(): void {
    if (this.root.style.display === 'none') return;
    this.root.style.display = 'none';
    const callback = this.closeCallback;
    this.closeCallback = null;
    callback?.();
  }

  private accept(questId: string): void {
    const active = this.quests.getActiveQuest();
    if (active?.definition.id === questId && active.completed) {
      const result = this.quests.claimQuestReward();
      this.status.classList.remove('danger');
      this.status.textContent = result.claimed
        ? 'ส่งเควสสำเร็จ — รับรางวัลแล้ว'
        : result.reason === 'pending-server'
          ? 'กำลังส่งเควสให้ Server...'
          : 'ยังส่งเควสไม่ได้';
      this.render();
      return;
    }
    let result = this.quests.acceptQuest(questId);
    if (result.reason === 'replace-confirmation') {
      const replace = window.confirm('ละทิ้งภารกิจปัจจุบันและรับภารกิจนี้แทนหรือไม่?');
      if (replace) result = this.quests.acceptQuest(questId, true);
    }
    if (result.accepted) {
      this.status.textContent = 'รับภารกิจแล้ว — ไปจัดการเป้าหมายได้เลย';
      this.status.classList.remove('danger');
    } else {
      this.status.classList.add('danger');
      this.status.textContent = result.reason === 'level-too-low'
        ? `ต้องการ Level ${result.requiredLevel}`
        : result.reason === 'already-active'
          ? 'กำลังทำภารกิจนี้อยู่แล้ว'
        : result.reason === 'replace-confirmation'
          ? 'ยังใช้ภารกิจเดิมอยู่'
          : 'ยังรับภารกิจนี้ไม่ได้';
    }
    this.render();
  }

  private render(): void {
    const state = this.progression.getState();
    this.cards.innerHTML = '';
    for (const quest of QUEST_DEFINITIONS) {
      const card = document.createElement('article');
      card.className = `quest-card${state.activeQuestId === quest.id ? ' active' : ''}`;
      const targetAmount = quest.objectives.reduce((total, objective) => total + objective.requiredAmount, 0);
      const locked = state.player.level < quest.minimumLevel;
      const active = state.activeQuestId === quest.id;
      const ready = active && this.quests.getActiveQuest()?.completed === true;
      const completed = !quest.repeatable && state.completedQuestIds.includes(quest.id);
      card.innerHTML = `<h3>${quest.name}</h3><p>${quest.description}</p>
        <div class="quest-card-meta"><span>Lv.${quest.minimumLevel}+</span>
          <span>${targetAmount} เป้าหมาย</span><span>${quest.objectives.length > 1 ? `${quest.objectives.length} ขั้น` : quest.repeatable ? 'ทำซ้ำได้' : 'ทำได้ครั้งเดียว'}</span></div>
        <div class="quest-card-reward">+${quest.rewards.playerExp} EXP · +${quest.rewards.coins} Coins · +${quest.rewards.masteryBonus ?? 0} Mastery</div>
        <button type="button" data-quest="${quest.id}" ${locked || completed || (active && !ready) ? 'disabled' : ''}>${
          ready ? 'ส่งเควส / รับรางวัล' : active ? 'กำลังทำภารกิจ' : completed ? 'ทำสำเร็จแล้ว' : locked ? `ต้องการ Lv.${quest.minimumLevel}` : 'รับภารกิจ'
        }</button>`;
      this.cards.appendChild(card);
    }
  }

  private renderIfOpen(): void {
    if (this.root.style.display !== 'none') this.render();
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      .quest-board-root { position:fixed; inset:0; z-index:77; display:flex; align-items:center; justify-content:center;
        padding:14px; box-sizing:border-box; background:rgba(1,10,18,.62); backdrop-filter:blur(5px);
        font-family:'Segoe UI',Tahoma,sans-serif; }
      .quest-board { width:min(690px,100%); max-height:86vh; overflow:auto; color:#edf8fa; padding:18px;
        border:1px solid rgba(255,217,118,.48); border-radius:17px; background:linear-gradient(145deg,#0a2937,#12434b);
        box-shadow:0 16px 52px rgba(0,0,0,.56); }
      .quest-board header { display:flex; justify-content:space-between; gap:12px; }
      .quest-board h2 { margin:0; color:#ffe18c; font-size:20px; }.quest-board header p{margin:4px 0;color:#9dbfc5;font-size:11px}
      .quest-board-close { border:0; color:#dae9eb; background:transparent; font-size:28px; cursor:pointer; }
      .quest-board-cards { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-top:15px; }
      .quest-card { display:flex; flex-direction:column; padding:12px; border-radius:12px; background:rgba(2,20,28,.5);
        border:1px solid rgba(120,195,207,.21); }.quest-card.active{border-color:#7ce9bd;box-shadow:inset 0 0 0 1px rgba(124,233,189,.18)}
      .quest-card h3{margin:0;color:#fff0bd;font-size:14px}.quest-card p{flex:1;color:#acc6ca;font-size:10px;line-height:1.48}
      .quest-card-meta{display:flex;flex-wrap:wrap;gap:4px}.quest-card-meta span{padding:3px 6px;border-radius:8px;background:rgba(107,190,203,.14);font-size:9px}
      .quest-card-reward{margin:9px 0;color:#9eeacb;font-size:9px;line-height:1.5}.quest-card button{border:0;border-radius:11px;padding:8px;
        color:#17272b;background:#ffda78;font-weight:800;cursor:pointer}.quest-card button:disabled{opacity:.45;cursor:not-allowed}
      .quest-board-status{min-height:18px;margin-top:10px;color:#8ef0c6;font-size:11px}.quest-board-status.danger{color:#ff9b83}
      @media(max-width:700px){.quest-board-root{align-items:flex-end;padding:7px}.quest-board{max-height:76vh;padding:14px}
        .quest-board-cards{grid-template-columns:1fr}.quest-card{display:grid;grid-template-columns:1fr auto;gap:5px}.quest-card p,.quest-card-meta,.quest-card-reward{grid-column:1/-1}}
    `;
    document.head.appendChild(style);
  }
}
