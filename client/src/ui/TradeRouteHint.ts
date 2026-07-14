import type { IslandId } from '../island/IslandTypes';
import type { TradeManager } from '../trade/TradeManager';
import { TRADE_COMMODITIES } from '../trade/databook/commodities';
import { getIsland } from '../island/IslandRegistry';
import { isTouchDevice } from '../engine/device';

/** วิดเจ็ตเส้นทางกำไรแบบกะทัดรัด — แยกจาก ProgressionHUD */
export class TradeRouteHint {
  private readonly root: HTMLDivElement;
  private islandId: IslandId = 'starter-island';
  private expanded = false;
  private trade: TradeManager | null = null;

  constructor() {
    const style = document.createElement('style');
    style.textContent = `
      .trade-route-hint{position:fixed;z-index:20;right:14px;top:98px;pointer-events:auto;
        touch-action:manipulation;max-width:200px}
      .trade-route-toggle{width:100%;border:1px solid rgba(120,200,170,.35);border-radius:10px;
        padding:6px 10px;background:rgba(6,28,32,.85);color:#dff7ee;cursor:pointer;
        font:600 10px 'Segoe UI',Tahoma,sans-serif;text-align:left;display:flex;gap:6px;align-items:center;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .trade-route-toggle:active{transform:scale(.98)}
      .trade-route-body{display:none;margin-top:4px;padding:8px 10px;border-radius:10px;
        background:rgba(6,28,32,.88);border:1px solid rgba(120,200,170,.3);
        color:#b8e8d4;font:600 10px 'Segoe UI',Tahoma,sans-serif;line-height:1.45}
      .trade-route-hint.expanded .trade-route-body{display:block}
      .trade-route-profit{color:#8ff0c5;margin-top:3px}
      @media(max-width:700px){
        .trade-route-hint{top:52px;right:10px;max-width:150px}
        .trade-route-toggle{font-size:9px;padding:5px 8px}
      }
      @media(max-width:599px){
        .trade-route-hint{top:48px;max-width:132px}
      }
      @media(min-width:701px){
        .trade-route-hint{top:108px}
      }
    `;
    document.head.appendChild(style);
    this.root = document.createElement('div');
    this.root.className = 'trade-route-hint';
    this.root.innerHTML = `
      <button type="button" class="trade-route-toggle">⚓ <span class="trade-route-compact">เส้นทาง</span></button>
      <div class="trade-route-body"></div>`;
    document.body.appendChild(this.root);
    this.root.querySelector('.trade-route-toggle')!
      .addEventListener('click', () => {
        this.expanded = !this.expanded;
        this.root.classList.toggle('expanded', this.expanded);
      });
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
    this.root.style.display = show ? 'block' : 'none';
    if (!show) this.expanded = false;
    this.root.classList.remove('expanded');
    this.render();
  }

  refresh(): void {
    this.render();
  }

  private render(): void {
    const body = this.root.querySelector('.trade-route-body')!;
    const compact = this.root.querySelector('.trade-route-compact')!;

    if (!this.trade || this.root.style.display === 'none') return;

    const arb = this.trade.living.bestArbitrageFrom(this.islandId);
    if (!arb || arb.profit <= 0) {
      this.root.style.display = 'none';
      return;
    }

    const commodity = TRADE_COMMODITIES.find((c) => c.id === arb.commodityId);
    const icon = commodity?.icon ?? '📦';
    const name = commodity?.nameTh ?? arb.commodityId;
    const toName = getIsland(arb.toIslandId).name;
    const shortDest = toName.split(' ').slice(0, 2).join(' ');

    if (isTouchDevice() || window.innerWidth < 600) {
      compact.textContent = `${icon} → ${shortDest}`;
    } else {
      compact.textContent = `${icon} ${name} → ${toName}`;
    }

    body.innerHTML = `ซื้อ <b>${name}</b><br>ขายที่ <b>${toName}</b>
      <div class="trade-route-profit">กำไร ~${arb.profit} Beli/ชิ้น</div>`;
    this.root.style.display = 'block';
  }
}
