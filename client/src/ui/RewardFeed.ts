import type { ProgressionManager } from '../progression/ProgressionManager';

export class RewardFeed {
  private readonly root: HTMLDivElement;
  private pending: string[] = [];
  private pendingTimer = 0;
  private visibleTimer = 0;

  constructor(progression: ProgressionManager) {
    const style = document.createElement('style');
    style.textContent = `
      .reward-feed { position:fixed; z-index:35; left:50%; top:25%; transform:translateX(-50%);
        min-width:160px; padding:9px 15px; box-sizing:border-box; pointer-events:none; text-align:center;
        color:#dffff2; background:rgba(4,22,29,.78); border:1px solid rgba(114,238,190,.45);
        border-radius:12px; box-shadow:0 5px 20px rgba(0,0,0,.38); opacity:0;
        font:800 12px/1.55 'Segoe UI',Tahoma,sans-serif; text-shadow:0 1px 2px #000;
        transition:opacity .2s,transform .25s; }
      .reward-feed.show { opacity:1; transform:translate(-50%,-8px); }
      .reward-feed.level { color:#ffe589; border-color:#ffe079; font-size:17px; }
    `;
    document.head.appendChild(style);
    this.root = document.createElement('div');
    this.root.className = 'reward-feed';
    document.body.appendChild(this.root);

    progression.events.on('reward:granted', (reward) => {
      this.queue(`+${reward.playerExp} EXP`);
      this.queue(`+${reward.coins} Coins`);
      for (const mastery of reward.mastery) this.queue(`+${mastery.amount} Mastery`);
    });
    progression.events.on('quest:completed', ({ playerExp, coins, masteryBonus }) => {
      this.queue(`Quest: +${playerExp} EXP`);
      this.queue(`+${coins} Coins`);
      if (masteryBonus > 0) this.queue(`+${masteryBonus} Mastery`);
    });
    progression.events.on('player:level-up', ({ newLevel, statPointsGained }) => {
      this.show([`LEVEL UP!`, `Lv.${newLevel} · +${statPointsGained} Stat Points`], true);
    });
    progression.events.on('skill:unlocked', ({ skillName }) => {
      this.queue(`ปลดล็อก ${skillName}!`);
    });
    progression.events.on('skill:locked', ({ masteryRequired }) => {
      this.show([`ต้องการ Mastery ${masteryRequired}`], false);
    });
  }

  update(dt: number): void {
    if (this.pending.length > 0) {
      this.pendingTimer += dt;
      if (this.pendingTimer >= 0.5) {
        const lines = [...this.pending];
        this.pending = [];
        this.pendingTimer = 0;
        this.show(lines, false);
      }
    }
    if (this.visibleTimer > 0) {
      this.visibleTimer -= dt;
      if (this.visibleTimer <= 0) this.root.classList.remove('show', 'level');
    }
  }

  private queue(message: string): void {
    if (!this.pending.includes(message)) this.pending.push(message);
  }

  private show(lines: string[], level: boolean): void {
    this.root.textContent = '';
    for (const line of lines) {
      const div = document.createElement('div');
      div.textContent = line;
      this.root.appendChild(div);
    }
    this.root.classList.toggle('level', level);
    this.root.classList.remove('show');
    requestAnimationFrame(() => this.root.classList.add('show'));
    this.visibleTimer = level ? 2.5 : 1.9;
  }
}
