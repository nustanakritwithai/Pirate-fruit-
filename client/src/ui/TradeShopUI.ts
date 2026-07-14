import type { TradeManager } from '../trade/TradeManager';
import type { IslandId } from '../island/IslandTypes';
import {
  TRADE_COMMODITIES,
  buyPrice,
  sellPrice,
  getMarketForIsland,
  getTradeVendor,
  cargoSlotsUsed,
  cargoTotalWeight,
} from '../trade/TradeRegistry';

/**
 * ร้านค้าเทรดระหว่างเกาะ — ซื้อ/ขายสินค้า cargo บนเรือ
 */
export class TradeShopUI {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLHeadingElement;
  private readonly wallet: HTMLSpanElement;
  private readonly cargoInfo: HTMLDivElement;
  private readonly table: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private closeCallback: (() => void) | null = null;
  private islandId: IslandId = 'starter-island';
  private vendorName = '';

  constructor(
    private trade: TradeManager,
    private onChange?: () => void,
  ) {
    this.injectStyles();
    this.root = document.createElement('div');
    this.root.className = 'trade-shop-root';
    this.root.innerHTML = `
      <div class="trade-shop">
        <div class="trade-shop-head">
          <div>
            <h2></h2>
            <p>ซื้อถูกที่เกาะผลิต · ขายแพงที่เกาะต้องการ · ของเก็บใน cargo เรือ</p>
          </div>
          <div class="trade-shop-wallet">🪙 <span></span></div>
          <button class="trade-shop-close" type="button" aria-label="ปิด">×</button>
        </div>
        <div class="trade-cargo-info"></div>
        <div class="trade-shop-table"></div>
        <div class="trade-shop-status"></div>
      </div>`;
    document.body.appendChild(this.root);
    this.title = this.root.querySelector('h2')!;
    this.wallet = this.root.querySelector('.trade-shop-wallet span')!;
    this.cargoInfo = this.root.querySelector('.trade-cargo-info')!;
    this.table = this.root.querySelector('.trade-shop-table')!;
    this.status = this.root.querySelector('.trade-shop-status')!;
    this.root.querySelector<HTMLButtonElement>('.trade-shop-close')!
      .addEventListener('click', () => this.close());
    this.root.addEventListener('click', (event) => {
      const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-trade]');
      if (!btn) return;
      const commodityId = btn.dataset.commodity!;
      const action = btn.dataset.trade as 'buy' | 'sell';
      const qty = Number(btn.dataset.qty ?? '1');
      const result = action === 'buy'
        ? this.trade.buy(this.islandId, commodityId, qty)
        : this.trade.sell(this.islandId, commodityId, qty);
      this.setStatus(result.message, result.ok);
      if (result.ok) {
        this.onChange?.();
        this.render();
      }
    });
    this.root.style.display = 'none';
  }

  get isOpen(): boolean {
    return this.root.style.display !== 'none';
  }

  open(islandId: IslandId, vendorId: string | undefined, onClose: () => void): void {
    if (document.pointerLockElement) document.exitPointerLock();
    this.islandId = islandId;
    const vendor = vendorId ? getTradeVendor(vendorId) : undefined;
    this.vendorName = vendor?.nameTh ?? getMarketForIsland(islandId)?.nameTh ?? 'ตลาด';
    this.closeCallback = onClose;
    this.root.style.display = 'flex';
    this.setStatus('');
    this.render();
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.style.display = 'none';
    const cb = this.closeCallback;
    this.closeCallback = null;
    cb?.();
  }

  private render(): void {
    const market = getMarketForIsland(this.islandId);
    if (!market) {
      this.setStatus('ไม่พบตลาดของเกาะนี้', false);
      return;
    }
    this.title.textContent = `🏪 ${this.vendorName}`;
    this.wallet.textContent = String(this.trade.walletCoins);

    const hold = this.trade.hold;
    const weight = cargoTotalWeight(hold.slots, TRADE_COMMODITIES);
    const slots = cargoSlotsUsed(hold.slots);
    this.cargoInfo.innerHTML =
      `📦 Cargo: <b>${slots}/${hold.maxSlots}</b> ช่อง · น้ำหนัก <b>${weight}/${hold.maxWeight}</b>`;

    const rows = market.entries.map((entry) => {
      const commodity = TRADE_COMMODITIES.find((c) => c.id === entry.commodityId);
      if (!commodity) return '';
      const inCargo = hold.slots.find((s) => s.commodityId === commodity.id)?.quantity ?? 0;
      const roleLabel = entry.role === 'export' ? 'ส่งออก' : entry.role === 'import' ? 'นำเข้า' : 'กลาง';
      const roleClass = entry.role;
      return `<div class="trade-row">
        <div class="trade-item">
          <span class="trade-icon">${commodity.icon}</span>
          <div>
            <div class="trade-name">${commodity.nameTh}</div>
            <div class="trade-role trade-role-${roleClass}">${roleLabel}</div>
          </div>
        </div>
        <div class="trade-prices">
          <span class="trade-buy">${buyPrice(commodity, entry)}</span>
          <span class="trade-sell">${sellPrice(commodity, entry)}</span>
        </div>
        <div class="trade-cargo-qty">${inCargo}</div>
        <div class="trade-actions">
          <button type="button" data-trade="buy" data-commodity="${commodity.id}" data-qty="1">+1</button>
          <button type="button" data-trade="buy" data-commodity="${commodity.id}" data-qty="5">+5</button>
          <button type="button" data-trade="sell" data-commodity="${commodity.id}" data-qty="1">−1</button>
          <button type="button" data-trade="sell" data-commodity="${commodity.id}" data-qty="5">−5</button>
        </div>
      </div>`;
    }).join('');

    this.table.innerHTML = `
      <div class="trade-header">
        <span>สินค้า</span><span>ซื้อ</span><span>ขาย</span><span>ในเรือ</span><span>ทำรายการ</span>
      </div>${rows}`;
  }

  private setStatus(message: string, ok = true): void {
    this.status.textContent = message;
    this.status.className = `trade-shop-status${message ? ok ? ' ok' : ' err' : ''}`;
  }

  private injectStyles(): void {
    if (document.getElementById('trade-shop-styles')) return;
    const style = document.createElement('style');
    style.id = 'trade-shop-styles';
    style.textContent = `
      .trade-shop-root{position:fixed;inset:0;z-index:45;display:flex;align-items:center;justify-content:center;
        background:rgba(2,12,20,.72);padding:12px;box-sizing:border-box}
      .trade-shop{width:min(560px,96vw);max-height:88vh;overflow:auto;background:linear-gradient(165deg,#0a2430,#061820);
        border:1px solid rgba(120,210,180,.35);border-radius:14px;padding:14px 16px;color:#e8f4f2;
        font:600 12px 'Segoe UI',Tahoma,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.45)}
      .trade-shop-head{display:flex;gap:10px;align-items:flex-start;margin-bottom:10px}
      .trade-shop-head h2{margin:0;font-size:17px;color:#ffe9a8}
      .trade-shop-head p{margin:4px 0 0;font-size:10px;color:#9ec5bc;font-weight:500}
      .trade-shop-wallet{margin-left:auto;white-space:nowrap;color:#ffd76a;font-size:14px}
      .trade-shop-close{background:transparent;border:0;color:#fff;font-size:22px;cursor:pointer;line-height:1}
      .trade-cargo-info{margin-bottom:8px;padding:7px 10px;border-radius:8px;background:rgba(255,255,255,.06);font-size:11px}
      .trade-header,.trade-row{display:grid;grid-template-columns:1.4fr .7fr .7fr .6fr 1.3fr;gap:6px;align-items:center}
      .trade-header{font-size:9px;color:#8eb5aa;text-transform:uppercase;margin-bottom:4px}
      .trade-row{padding:6px 0;border-top:1px solid rgba(255,255,255,.07)}
      .trade-item{display:flex;gap:8px;align-items:center}
      .trade-icon{font-size:18px}
      .trade-name{font-size:12px}
      .trade-role{font-size:9px;font-weight:700}
      .trade-role-export{color:#7fe0a3}.trade-role-import{color:#ffb86c}.trade-role-neutral{color:#9eb5c8}
      .trade-buy{color:#ff8e8e}.trade-sell{color:#8ff0c5}
      .trade-cargo-qty{text-align:center;color:#c8e8ff}
      .trade-actions{display:flex;gap:3px;flex-wrap:wrap}
      .trade-actions button{padding:3px 6px;border-radius:6px;border:1px solid rgba(255,255,255,.2);
        background:rgba(255,255,255,.08);color:#fff;cursor:pointer;font-size:10px;font-weight:700}
      .trade-actions button:hover{background:rgba(255,255,255,.16)}
      .trade-shop-status{min-height:18px;margin-top:8px;font-size:11px}
      .trade-shop-status.ok{color:#8ff0c5}.trade-shop-status.err{color:#ff9b8e}
    `;
    document.head.appendChild(style);
  }
}
