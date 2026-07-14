import type { TradeManager } from '../trade/TradeManager';
import { filterActiveNews } from '../trade/living/LivingTradeNews';

/** แถบข่าวเศรษฐกิจในเกม — แสดงตลอดเมื่อมีข่าว */
export class EconomyNewsTicker {
  private readonly root: HTMLDivElement;
  private index = 0;
  private rotateTimer = 0;

  constructor(private trade: TradeManager) {
    const style = document.createElement('style');
    style.textContent = `
      .economy-ticker{position:fixed;z-index:17;left:50%;transform:translateX(-50%);bottom:92px;
        max-width:min(520px,92vw);padding:6px 14px;pointer-events:none;box-sizing:border-box;
        background:rgba(8,28,32,.88);border:1px solid rgba(120,200,170,.35);border-radius:20px;
        color:#d8f2ea;font:600 11px 'Segoe UI',Tahoma,sans-serif;text-align:center;
        display:none;text-shadow:0 1px 2px #000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .economy-ticker-label{color:#ffe08a;margin-right:6px}
      @media(max-width:700px){.economy-ticker{bottom:86px;font-size:10px;padding:5px 10px}}
    `;
    document.head.appendChild(style);
    this.root = document.createElement('div');
    this.root.className = 'economy-ticker';
    document.body.appendChild(this.root);
  }

  update(dt: number, shopOpen: boolean): void {
    if (shopOpen) {
      this.root.style.display = 'none';
      return;
    }
    const news = filterActiveNews(this.trade.living.news);
    if (!news.length) {
      this.root.style.display = 'none';
      return;
    }
    this.rotateTimer += dt;
    if (this.rotateTimer >= 6) {
      this.rotateTimer = 0;
      this.index = (this.index + 1) % news.length;
    }
    const item = news[this.index % news.length];
    this.root.style.display = 'block';
    this.root.innerHTML =
      `<span class="economy-ticker-label">📰 ตลาด</span>${item.message}`;
  }
}
