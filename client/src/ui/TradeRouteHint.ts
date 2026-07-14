import type { IslandId } from '../island/IslandTypes';
import type { TradeManager } from '../trade/TradeManager';
import { TRADE_COMMODITIES } from '../trade/databook/commodities';
import { TRADE_ROUTES } from '../trade/databook/tradeRoutes';
import { getIsland } from '../island/IslandRegistry';
import { filterActiveNews } from '../trade/living/LivingTradeNews';

/** แผงแนะนำเส้นทางเทรดกำไรจากเกาะปัจจุบัน (Living Trade Network) */
export class TradeRouteHint {
  private readonly root: HTMLDivElement;
  private islandId: IslandId = 'starter-island';
  private visible = false;
  private trade: TradeManager | null = null;

  constructor() {
    const style = document.createElement('style');
    style.textContent = `
      .trade-route-hint{position:fixed;z-index:18;left:16px;bottom:118px;width:220px;box-sizing:border-box;
        padding:8px 10px;pointer-events:none;color:#dff7ee;background:rgba(6,28,32,.82);
        border:1px solid rgba(120,200,170,.35);border-radius:10px;font:600 10px 'Segoe UI',Tahoma,sans-serif;
        display:none;text-shadow:0 1px 2px #000}
      .trade-route-hint-title{color:#ffe08a;margin-bottom:4px;font-size:11px}
      .trade-route-hint-route{color:#b8e8d4;line-height:1.45}
      .trade-route-hint-profit{color:#8ff0c5}
      .trade-route-hint-news{color:#c8e0d8;font-size:9px;margin-top:5px;line-height:1.35;opacity:.9}
      @media(max-width:700px){.trade-route-hint{left:8px;bottom:108px;width:168px;font-size:9px}}
    `;
    document.head.appendChild(style);
    this.root = document.createElement('div');
    this.root.className = 'trade-route-hint';
    document.body.appendChild(this.root);
  }

  bindTradeManager(trade: TradeManager): void {
    this.trade = trade;
    this.render();
  }

  setIsland(islandId: IslandId): void {
    if (this.islandId === islandId) return;
    this.islandId = islandId;
    this.render();
  }

  setVisible(show: boolean): void {
    this.visible = show;
    this.render();
  }

  refresh(): void {
    this.render();
  }

  private render(): void {
    if (!this.visible) {
      this.root.style.display = 'none';
      return;
    }
    const route = TRADE_ROUTES.find((r) => r.fromIslandId === this.islandId);

    let best: { name: string; profit: number; toName: string } | null = null;
    if (this.trade) {
      const arb = this.trade.living.bestArbitrageFrom(this.islandId);
      if (arb) {
        const commodity = TRADE_COMMODITIES.find((c) => c.id === arb.commodityId);
        best = {
          name: commodity?.nameTh ?? arb.commodityId,
          profit: arb.profit,
          toName: getIsland(arb.toIslandId).name,
        };
      }
    }

    const news = this.trade
      ? filterActiveNews(this.trade.living.news).slice(0, 1)
      : [];
    const newsHtml = news.length
      ? `<div class="trade-route-hint-news">📰 ${news[0].message}</div>`
      : '';

    this.root.style.display = 'block';
    if (best) {
      this.root.innerHTML = `<div class="trade-route-hint-title">⚓ Living Trade</div>
        <div class="trade-route-hint-route">ซื้อ <b>${best.name}</b><br>ขายที่ <b>${best.toName}</b></div>
        <div class="trade-route-hint-profit">กำไร ~${best.profit} Beli/ชิ้น</div>${newsHtml}`;
    } else if (route) {
      this.root.innerHTML = `<div class="trade-route-hint-title">⚓ เส้นทางเทรด</div>
        <div class="trade-route-hint-route">${route.nameTh}</div>${newsHtml}`;
    } else {
      this.root.style.display = 'none';
    }
  }
}
