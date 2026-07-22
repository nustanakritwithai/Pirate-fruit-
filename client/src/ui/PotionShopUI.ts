import type { ItemInventory } from '../shop/ItemInventory';
import { POTIONS, POTION_IDS } from '../shop/PotionData';

/**
 * ร้านขายยาฟื้นฟู (พ่อค้าเปา) — ซื้อยา HP/MP ด้วยเหรียญ
 * onChange ให้ HotkeyManager/กระเป๋ารีเฟรชจำนวนยา
 */
export class PotionShopUI {
  private readonly root: HTMLDivElement;
  private readonly coins: HTMLSpanElement;
  private readonly list: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private purchaseInFlight = false;
  private closeCallback: (() => void) | null = null;

  constructor(
    private inventory: ItemInventory,
    private onChange: () => void,
  ) {
    this.injectStyles();
    this.root = document.createElement('div');
    this.root.className = 'potion-shop-root';
    this.root.innerHTML = `
      <div class="potion-shop">
        <div class="potion-shop-head">
          <div><h2>🧪 ร้านยาพ่อค้าเปา</h2><p>ซื้อยาฟื้น HP/MP แล้วจัดลงช่องลัดที่กระเป๋า (B)</p></div>
          <div class="potion-shop-wallet">🪙 <span></span></div>
          <button class="potion-shop-close" type="button" aria-label="ปิด">×</button>
        </div>
        <div class="potion-shop-status"></div>
        <div class="potion-shop-list"></div>
      </div>`;
    document.body.appendChild(this.root);
    this.coins = this.root.querySelector('.potion-shop-wallet span')!;
    this.list = this.root.querySelector('.potion-shop-list')!;
    this.status = this.root.querySelector('.potion-shop-status')!;

    this.root.querySelector<HTMLButtonElement>('.potion-shop-close')!
      .addEventListener('click', () => this.close());
    this.root.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-buy]');
      if (!button) return;
      const id = button.dataset.buy!;
      void this.purchase(id);
    });
    this.root.style.display = 'none';
  }

  private async purchase(id: string): Promise<void> {
    if (this.purchaseInFlight) return;
    this.purchaseInFlight = true;
    this.render();
    try {
      if (await this.inventory.buyPotionAsync(id)) {
        this.onChange();
        this.setStatus(`ซื้อ ${POTIONS[id]?.nameTh ?? id} แล้ว ✓`);
      } else {
        this.setStatus('เหรียญไม่พอ 🪙', true);
      }
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : 'เชื่อมต่อร้านค้าไม่สำเร็จ', true);
    } finally {
      this.purchaseInFlight = false;
      this.render();
    }
  }

  get isOpen(): boolean {
    return this.root.style.display !== 'none';
  }

  /** Refresh an open wallet after any authoritative progression update. */
  refresh(): void {
    if (this.isOpen) this.render();
  }

  open(onClose: () => void): void {
    if (document.pointerLockElement) document.exitPointerLock();
    this.closeCallback = onClose;
    this.root.style.display = 'flex';
    this.setStatus('');
    this.render();
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.style.display = 'none';
    const callback = this.closeCallback;
    this.closeCallback = null;
    callback?.();
  }

  private setStatus(message: string, danger = false): void {
    this.status.textContent = message;
    this.status.classList.toggle('danger', danger);
  }

  private render(): void {
    this.coins.textContent = `${this.inventory.coins} เหรียญ`;
    this.list.innerHTML = POTION_IDS.map((id) => {
      const p = POTIONS[id];
      const owned = this.inventory.getConsumableCount(id);
      const cannotAfford = this.inventory.coins < p.price;
      return `
        <div class="potion-card">
          <div class="potion-card-icon">${p.icon}</div>
          <div class="potion-card-body">
            <h4>${p.nameTh}</h4>
            <div class="potion-card-effect">ฟื้น ${p.restore} ${p.kind === 'hp' ? 'HP' : 'MP'} · มีอยู่ ${owned}</div>
          </div>
          <button type="button" data-buy="${id}" ${cannotAfford || this.purchaseInFlight ? 'disabled' : ''}>ซื้อ · ${p.price} 🪙</button>
        </div>`;
    }).join('');
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      .potion-shop-root { position:fixed; inset:0; z-index:76; display:flex; align-items:center; justify-content:center;
        padding:16px; box-sizing:border-box; background:rgba(2,12,20,.6); backdrop-filter:blur(5px);
        font-family:'Segoe UI',Tahoma,sans-serif; }
      .potion-shop { width:min(520px,100%); max-height:88vh; overflow:auto; color:#eafaf1;
        background:linear-gradient(150deg,#08281a,#0d3a26); border:1px solid rgba(120,235,150,.5);
        border-radius:18px; padding:18px; box-shadow:0 16px 55px rgba(0,0,0,.6); }
      .potion-shop-head { display:flex; align-items:flex-start; gap:14px; }
      .potion-shop-head h2 { margin:0; color:#b6f7cd; font-size:20px; }
      .potion-shop-head p { margin:4px 0 0; color:#9ac9ae; font-size:12px; }
      .potion-shop-wallet { margin-left:auto; white-space:nowrap; color:#ffe69a; font-weight:800; font-size:13px;
        border:1px solid rgba(255,222,133,.35); border-radius:16px; padding:6px 10px; }
      .potion-shop-close { border:0; color:#d7e7dd; background:transparent; font-size:28px; cursor:pointer; }
      .potion-shop-status { min-height:16px; margin:10px 2px; color:#8ff0cd; font-size:12px; }
      .potion-shop-status.danger { color:#ff927c; }
      .potion-shop-list { display:flex; flex-direction:column; gap:10px; margin-top:6px; }
      .potion-card { display:grid; grid-template-columns:46px 1fr auto; gap:12px; align-items:center; padding:11px 13px;
        border-radius:13px; border:1px solid rgba(120,200,150,.3); background:rgba(6,26,16,.55); }
      .potion-card-icon { font-size:30px; text-align:center; }
      .potion-card-body h4 { margin:0; color:#f1fff5; font-size:14px; }
      .potion-card-effect { font-size:11px; color:#9fd7b4; margin-top:3px; }
      .potion-card>button { border:0; border-radius:12px; padding:9px 14px; cursor:pointer; white-space:nowrap;
        color:#0d2417; background:#7ce6a0; font-weight:800; touch-action:manipulation; }
      .potion-card>button:disabled { opacity:.45; cursor:not-allowed; }
      @media(max-width:650px){ .potion-shop-root{ align-items:flex-end; padding:8px; }
        .potion-shop{ max-height:82vh; padding:14px; } }
    `;
    document.head.appendChild(style);
  }
}
