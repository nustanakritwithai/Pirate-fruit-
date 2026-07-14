import type { IslandId } from '../island/IslandTypes';
import { TRADE_COMMODITIES } from '../trade/databook/commodities';
import { ISLAND_MARKETS } from '../trade/databook/islandMarkets';
import { TRADE_ROUTES } from '../trade/databook/tradeRoutes';
import { bestArbitrageForCommodity } from '../trade/TradeFormulas';
import { getIsland } from '../island/IslandRegistry';

/** แผงแนะนำเส้นทางเทรดกำไรจากเกาะปัจจุบัน */
export class TradeRouteHint {
  private readonly root: HTMLDivElement;
  private islandId: IslandId = 'starter-island';
  private visible = false;

  constructor() {
    const style = document.createElement('style');
    style.textContent = `
      .trade-route-hint{position:fixed;z-index:18;left:16px;bottom:118px;width:210px;box-sizing:border-box;
        padding:8px 10px;pointer-events:none;color:#dff7ee;background:rgba(6,28,32,.82);
        border:1px solid rgba(120,200,170,.35);border-radius:10px;font:600 10px 'Segoe UI',Tahoma,sans-serif;
        display:none;text-shadow:0 1px 2px #000}
      .trade-route-hint-title{color:#ffe08a;margin-bottom:4px;font-size:11px}
      .trade-route-hint-route{color:#b8e8d4;line-height:1.45}
      .trade-route-hint-profit{color:#8ff0c5}
      @media(max-width:700px){.trade-route-hint{left:8px;bottom:108px;width:168px;font-size:9px}}
    `;
    document.head.appendChild(style);
    this.root = document.createElement('div');
    this.root.className = 'trade-route-hint';
    document.body.appendChild(this.root);
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

  private render(): void {
    if (!this.visible) {
      this.root.style.display = 'none';
      return;
    }
    const island = getIsland(this.islandId);
    let best: { name: string; profit: number; toName: string } | null = null;

    for (const commodity of TRADE_COMMODITIES) {
      const arb = bestArbitrageForCommodity(commodity, ISLAND_MARKETS);
      if (!arb || arb.fromIslandId !== this.islandId) continue;
      if (!best || arb.profit > best.profit) {
        best = {
          name: commodity.nameTh,
          profit: arb.profit,
          toName: getIsland(arb.toIslandId as IslandId).name,
        };
      }
    }

    const route = TRADE_ROUTES.find((r) => r.fromIslandId === this.islandId);
    this.root.style.display = 'block';
    if (best) {
      this.root.innerHTML = `<div class="trade-route-hint-title">⚓ เทรดจาก${island.name}</div>
        <div class="trade-route-hint-route">ซื้อ <b>${best.name}</b><br>ขายที่ <b>${best.toName}</b></div>
        <div class="trade-route-hint-profit">กำไร ~${best.profit} Beli/ชิ้น</div>`;
    } else if (route) {
      this.root.innerHTML = `<div class="trade-route-hint-title">⚓ เส้นทางเทรด</div>
        <div class="trade-route-hint-route">${route.nameTh}</div>`;
    } else {
      this.root.style.display = 'none';
    }
  }
}
