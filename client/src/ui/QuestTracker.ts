import type { QuestManager } from '../quest/QuestManager';

const TARGET_NAMES: Record<string, string> = {
  crab: 'ปูทะเลดุ',
  grunt: 'โจรสลัดเร่ร่อน',
  boss: 'กัปตันหนวดดำ',
  'jungle-bandit': 'โจรป่าพงไพร',
  'ruin-guardian': 'ผู้พิทักษ์ศิลา',
  'venom-ape-boss': 'วานรพิษโบราณ',
  'dune-scorpion': 'แมงป่องเนินทราย',
  'desert-raider': 'โจรคาราวาน',
  'sand-golem': 'โกเลมศิลาทราย',
  'sun-guardian-boss': 'ผู้พิทักษ์สุริยะ',
  'frost-crawler': 'แมงมุมน้ำแข็ง',
  'frost-raider': 'โจรน้ำแข็ง',
  'crystal-golem': 'โกเลมคริสตัลคราม',
  'frost-king-boss': 'ราชันน้ำแข็งโบราณ',
  'cloud-crab': 'ปูเมฆสายฟ้า',
  'sky-raider': 'โจรเวหา',
  'storm-golem': 'โกเลมผลึกพายุ',
  'tempest-lord-boss': 'เจ้าแห่งพายุนิรันดร์',
  'fresh-fish': 'ปลาสด',
  'jungle-herb': 'สมุนไพรป่า',
  'sun-silk': 'ผ้าไหมสุริยะ',
};

export class QuestTracker {
  private readonly root: HTMLDivElement;
  private completedMessageTimer = 0;

  constructor(private quests: QuestManager) {
    const style = document.createElement('style');
    style.textContent = `
      .quest-tracker { position:fixed; z-index:19; right:16px; top:136px; width:190px; box-sizing:border-box;
        padding:10px 12px; pointer-events:none; color:#f2fbfc; background:rgba(6,24,34,.76);
        border:1px solid rgba(255,215,112,.32); border-radius:11px; box-shadow:0 4px 14px rgba(0,0,0,.3);
        font:700 11px 'Segoe UI',Tahoma,sans-serif; text-shadow:0 1px 2px #000; display:none; }
      .quest-tracker-title { color:#ffdd83; margin-bottom:5px; }
      .quest-tracker-objective { color:#c2d9dc; font-size:10px; line-height:1.5; }
      .quest-tracker.complete { border-color:#79efbd; color:#8ff0c5; animation:quest-pop .55s ease; }
      @keyframes quest-pop{50%{transform:scale(1.06);box-shadow:0 0 22px rgba(92,240,179,.62)}}
      @media(max-width:700px){.quest-tracker{right:8px;top:137px;width:152px;padding:7px 9px;font-size:10px}
        .quest-tracker-objective{font-size:9px}}
    `;
    document.head.appendChild(style);
    this.root = document.createElement('div');
    this.root.className = 'quest-tracker';
    document.body.appendChild(this.root);
    const events = quests.events;
    events.on('quest:accepted', () => this.render());
    events.on('quest:progress', () => this.render());
    events.on('quest:completed', ({ name, playerExp, coins }) => {
      this.completedMessageTimer = 3.2;
      this.root.style.display = 'block';
      this.root.classList.add('complete');
      this.root.innerHTML = `<div class="quest-tracker-title">QUEST COMPLETE</div>
        <div>${name}</div><div class="quest-tracker-objective">+${playerExp} EXP · +${coins} Coins</div>`;
    });
    this.render();
  }

  update(dt: number): void {
    if (this.completedMessageTimer <= 0) return;
    this.completedMessageTimer -= dt;
    if (this.completedMessageTimer <= 0) {
      this.root.classList.remove('complete');
      this.render();
    }
  }

  private render(): void {
    if (this.completedMessageTimer > 0) return;
    const active = this.quests.getActiveQuest();
    if (!active) {
      this.root.style.display = 'none';
      return;
    }
    this.root.style.display = 'block';
    this.root.classList.remove('complete');
    const objectives = active.definition.objectives.map((objective, index) => {
      const label = TARGET_NAMES[objective.targetId] ?? objective.targetId;
      const suffix = objective.type === 'deliver' && objective.islandId
        ? ` → ${objective.islandId === 'starter-island' ? 'เกาะแรก' : objective.islandId === 'mist-jungle' ? 'ป่าหมอก' : 'ทะเลทราย'}`
        : '';
      return `<div class="quest-tracker-objective">${label}${suffix} ` +
        `${active.progress[index]} / ${objective.requiredAmount}</div>`;
    }).join('');
    this.root.innerHTML = `<div class="quest-tracker-title">📜 ${active.definition.name}</div>${objectives}`;
  }
}
