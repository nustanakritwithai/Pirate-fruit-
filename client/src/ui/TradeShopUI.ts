import type { TradeManager } from '../trade/TradeManager';
import type { IslandId } from '../island/IslandTypes';
import {
  TRADE_COMMODITIES,
  getIslandMarket,
  getMarketForIsland,
  getTradeVendor,
  cargoSlotsUsed,
  cargoTotalWeight,
} from '../trade/TradeRegistry';
import { priceTrend } from '../trade/living/LivingTradeFormulas';
import { isLivingCommodity, resolveTradeCell } from '../trade/living/LivingTradeConfig';
import { filterActiveNews } from '../trade/living/LivingTradeNews';
import {
  LIVING_COMMODITY_META,
  recipeForOutput,
  type LivingBadge,
} from '../trade/living/ProductionRecipes';
import type { EconomyCellId } from '../trade/living/types';

const MARKET_CELL: Record<string, EconomyCellId> = {
  'starter-market': 'leaf-island',
  'starter-shipyard-market': 'shipyard-island',
  'mist-jungle-market': 'mine-island',
  'sunscar-desert-market': 'cloth-island',
};

const BADGE_LABELS: Record<LivingBadge, string> = {
  raw: 'วัตถุดิบ',
  processed: 'แปรรูป',
  food: 'อาหาร',
  tool: 'เครื่องมือ',
  'ship-supply': 'อุปกรณ์เรือ',
  luxury: 'ฟุ่มเฟือย',
  perishable: 'เน่าเสีย',
};

/**
 * ร้านค้าเทรดระหว่างเกาะ — ราคาและสต็อกจาก Living Trade Network
 */
export class TradeShopUI {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLHeadingElement;
  private readonly wallet: HTMLSpanElement;
  private readonly cargoInfo: HTMLDivElement;
  private readonly table: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly news: HTMLDivElement;
  private closeCallback: (() => void) | null = null;
  private islandId: IslandId = 'starter-island';
  private vendorName = '';
  private marketId: string | null = null;

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
            <p>ราคาเปลี่ยนตามสต็อกและความต้องการ · ของเก็บใน cargo เรือ</p>
          </div>
          <div class="trade-shop-wallet">🪙 <span></span></div>
          <button class="trade-shop-close" type="button" aria-label="ปิด">×</button>
        </div>
        <div class="trade-cargo-info"></div>
        <div class="trade-news"></div>
        <div class="trade-shop-table"></div>
        <div class="trade-shop-status"></div>
      </div>`;
    document.body.appendChild(this.root);
    this.title = this.root.querySelector('h2')!;
    this.wallet = this.root.querySelector('.trade-shop-wallet span')!;
    this.cargoInfo = this.root.querySelector('.trade-cargo-info')!;
    this.news = this.root.querySelector('.trade-news')!;
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
    this.marketId = vendor?.marketId ?? getMarketForIsland(islandId)?.id ?? null;
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

  refresh(): void {
    if (this.isOpen) this.render();
  }

  private render(): void {
    const market = this.marketId ? getIslandMarket(this.marketId) : getMarketForIsland(this.islandId);
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

    const activeNews = filterActiveNews(this.trade.living.news).slice(0, 2);
    this.news.innerHTML = activeNews.length
      ? activeNews.map((n) => `<div class="trade-news-item">📰 ${n.message}</div>`).join('')
      : '';

    const cellId = this.marketId ? MARKET_CELL[this.marketId] : resolveTradeCell(this.islandId, 'fresh-fish');
    const factoryCell = cellId ? this.trade.living.getCell(cellId) : undefined;
    const factoryStatus = factoryCell && cellId
      ? this.trade.living.getFactoryStatus(cellId)
      : null;
    const factoryHtml = factoryStatus
      ? `<div class="trade-factory-warn">🏭 สถานะโรงงาน: ${factoryStatus}</div>`
      : '';

    const rows = market.entries.map((entry) => {
      const commodity = TRADE_COMMODITIES.find((c) => c.id === entry.commodityId);
      if (!commodity) return '';
      const inCargo = hold.slots.find((s) => s.commodityId === commodity.id)?.quantity ?? 0;
      const roleLabel = entry.role === 'export' ? 'ส่งออก' : entry.role === 'import' ? 'นำเข้า' : 'กลาง';
      const roleClass = entry.role;
      const buy = this.trade.resolveBuyPrice(this.islandId, commodity.id, 1) ?? 0;
      const sell = this.trade.resolveSellPrice(this.islandId, commodity.id, 1) ?? 0;

      let stockHtml = '';
      let trendHtml = '';
      let stateBadge = '';
      let badgeHtml = '';
      let recipeHtml = '';
      let item: ReturnType<TradeManager['living']['getCommodityAtGameIsland']> | undefined;
      if (isLivingCommodity(commodity.id)) {
        const meta = LIVING_COMMODITY_META[commodity.id];
        badgeHtml = `<span class="trade-badge trade-badge-${meta.badge}">${BADGE_LABELS[meta.badge]}</span>`;
        const recipe = recipeForOutput(commodity.id);
        if (recipe) {
          const inputs = Object.entries(recipe.inputs)
            .map(([id, amt]) => `${LIVING_COMMODITY_META[id as keyof typeof LIVING_COMMODITY_META].label} ${amt}`)
            .join(' · ');
          recipeHtml = `<div class="trade-recipe">ใช้ผลิต: ${inputs} → ${meta.label} ${recipe.outputAmount}</div>`;
        }
        item = this.trade.living.getCommodityAtGameIsland(this.islandId, commodity.id);
        if (item) {
          const trend = priceTrend(item);
          const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
          const trendClass = trend;
          stockHtml = `<span class="trade-stock" title="${item.marketState}">${Math.floor(item.stock)}</span>`;
          trendHtml = `<span class="trade-trend trade-trend-${trendClass}">${trendIcon}</span>`;
          stateBadge = `<span class="trade-state trade-state-${item.marketState}">${item.marketState}</span>`;
        }
      }

      return `<div class="trade-row">
        <div class="trade-item">
          <span class="trade-icon">${commodity.icon}</span>
          <div>
            <div class="trade-name">${commodity.nameTh} ${trendHtml} ${stateBadge} ${badgeHtml}</div>
            <div class="trade-role trade-role-${roleClass}">${roleLabel}</div>
            ${recipeHtml}
          </div>
        </div>
        <div class="trade-prices">
          <span class="trade-buy">${buy}</span>
          <span class="trade-sell">${sell}</span>
        </div>
        <div class="trade-cargo-qty">${stockHtml || inCargo}</div>
        <div class="trade-actions">
          <button type="button" data-trade="buy" data-commodity="${commodity.id}" data-qty="1">+1</button>
          <button type="button" data-trade="buy" data-commodity="${commodity.id}" data-qty="5">+5</button>
          <button type="button" data-trade="sell" data-commodity="${commodity.id}" data-qty="1">−1</button>
          <button type="button" data-trade="sell" data-commodity="${commodity.id}" data-qty="5">−5</button>
        </div>
      </div>`;
    }).join('');

    this.table.innerHTML = `
      ${factoryHtml}
      <div class="trade-header">
        <span>สินค้า</span><span>ซื้อ</span><span>ขาย</span><span>สต็อก/เรือ</span><span>ทำรายการ</span>
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
      .trade-shop{width:min(580px,96vw);max-height:88vh;overflow:auto;background:linear-gradient(165deg,#0a2430,#061820);
        border:1px solid rgba(120,210,180,.35);border-radius:14px;padding:14px 16px;color:#e8f4f2;
        font:600 12px 'Segoe UI',Tahoma,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.45)}
      .trade-shop-head{display:flex;gap:10px;align-items:flex-start;margin-bottom:10px}
      .trade-shop-head h2{margin:0;font-size:17px;color:#ffe9a8}
      .trade-shop-head p{margin:4px 0 0;font-size:10px;color:#9ec5bc;font-weight:500}
      .trade-shop-wallet{margin-left:auto;white-space:nowrap;color:#ffd76a;font-size:14px}
      .trade-shop-close{background:transparent;border:0;color:#fff;font-size:22px;cursor:pointer;line-height:1}
      .trade-cargo-info{margin-bottom:6px;padding:7px 10px;border-radius:8px;background:rgba(255,255,255,.06);font-size:11px}
      .trade-news{margin-bottom:8px;font-size:10px;color:#b8ddd4}
      .trade-news-item{padding:4px 8px;margin-bottom:3px;border-radius:6px;background:rgba(255,220,120,.08)}
      .trade-factory-warn{margin-bottom:8px;padding:6px 10px;border-radius:8px;background:rgba(255,160,90,.12);
        color:#ffc89a;font-size:10px}
      .trade-badge{font-size:8px;padding:1px 4px;border-radius:4px;margin-left:3px;font-weight:700}
      .trade-badge-raw{background:rgba(158,181,200,.2);color:#9eb5c8}
      .trade-badge-processed{background:rgba(127,200,224,.2);color:#7fc8e0}
      .trade-badge-food{background:rgba(127,224,163,.2);color:#7fe0a3}
      .trade-badge-tool{background:rgba(255,200,120,.2);color:#ffc878}
      .trade-badge-ship-supply{background:rgba(140,180,255,.2);color:#8cb4ff}
      .trade-badge-luxury{background:rgba(220,160,255,.2);color:#dca0ff}
      .trade-badge-perishable{background:rgba(255,142,142,.2);color:#ff9b8e}
      .trade-recipe{font-size:9px;color:#8eb5aa;margin-top:2px;font-weight:500}
      .trade-header,.trade-row{display:grid;grid-template-columns:1.4fr .7fr .7fr .6fr 1.3fr;gap:6px;align-items:center}
      .trade-header{font-size:9px;color:#8eb5aa;text-transform:uppercase;margin-bottom:4px}
      .trade-row{padding:6px 0;border-top:1px solid rgba(255,255,255,.07)}
      .trade-item{display:flex;gap:8px;align-items:center}
      .trade-icon{font-size:18px}
      .trade-name{font-size:12px}
      .trade-role{font-size:9px;font-weight:700}
      .trade-role-export{color:#7fe0a3}.trade-role-import{color:#ffb86c}.trade-role-neutral{color:#9eb5c8}
      .trade-buy{color:#ff8e8e}.trade-sell{color:#8ff0c5}
      .trade-stock{color:#9ed4ff;font-size:10px}
      .trade-trend{font-size:10px;margin-left:2px}
      .trade-trend-up{color:#ff9b8e}.trade-trend-down{color:#8ff0c5}.trade-trend-flat{color:#9eb5c8}
      .trade-state{font-size:8px;padding:1px 4px;border-radius:4px;margin-left:3px;text-transform:uppercase}
      .trade-state-surplus{background:rgba(127,224,163,.2);color:#7fe0a3}
      .trade-state-balanced{background:rgba(158,181,200,.15);color:#9eb5c8}
      .trade-state-shortage{background:rgba(255,184,108,.2);color:#ffb86c}
      .trade-state-crisis{background:rgba(255,142,142,.2);color:#ff8e8e}
      .trade-state-collapsed{background:rgba(255,77,77,.25);color:#ff6b6b}
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
