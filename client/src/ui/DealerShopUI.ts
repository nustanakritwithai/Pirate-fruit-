import type { ItemInventory, DrawResult } from '../shop/ItemInventory';
import {
  RARITY_LABEL,
  RARITY_COLOR,
  KIND_ICON,
  KIND_LABEL,
  type ItemKind,
  type Rarity,
} from '../shop/GachaData';
import { getSword } from '../swords/SwordRegistry';
import { getGun } from '../guns/GunRegistry';
import { getFightingStyle } from '../fighting-styles/FightingStyleRegistry';
import { getFruit } from '../fruit/FruitRegistry';

interface ItemMeta {
  name: string;
  rarity: Rarity;
}

function itemMeta(kind: ItemKind, id: string): ItemMeta {
  switch (kind) {
    case 'sword': {
      const s = getSword(id);
      return { name: s?.nameTh ?? id, rarity: s?.rarity ?? 'common' };
    }
    case 'gun': {
      const g = getGun(id);
      return { name: g?.nameTh ?? id, rarity: g?.rarity ?? 'common' };
    }
    case 'fighting-style': {
      const st = getFightingStyle(id);
      return { name: st?.nameTh ?? id, rarity: 'common' };
    }
    case 'fruit': {
      const f = getFruit(id);
      return { name: f?.nameTh ?? id, rarity: f?.rarity ?? 'common' };
    }
  }
}

const KIND_ORDER: ItemKind[] = ['fighting-style', 'sword', 'gun', 'fruit'];

/**
 * Phase 7 — ร้านสุ่มของดีลเลอร์ (Gacha) ที่ดึงของจาก databook
 * - ปุ่มสุ่ม 1 ครั้ง → ได้ดาบ/ปืน/สไตล์/ผลไม้ตามความหายาก
 * - รายการที่เป็นเจ้าของ + ปุ่มติดตั้ง (equip)
 * onChange รีเฟรช PlayerCombat หลัง equip/สุ่ม
 */
export class DealerShopUI {
  private readonly root: HTMLDivElement;
  private readonly coins: HTMLSpanElement;
  private readonly result: HTMLDivElement;
  private readonly lists: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly drawBtn: HTMLButtonElement;
  private drawInFlight = false;
  private closeCallback: (() => void) | null = null;

  constructor(
    private inventory: ItemInventory,
    private onChange: () => void,
  ) {
    this.injectStyles();
    this.root = document.createElement('div');
    this.root.className = 'dealer-shop-root';
    this.root.innerHTML = `
      <div class="dealer-shop">
        <div class="dealer-shop-head">
          <div><h2>🎴 ร้านสุ่มของดีลเลอร์</h2><p>สุ่มอาวุธและผลไม้ปีศาจ แล้วติดตั้งเพื่อใช้ชุดสกิล</p></div>
          <div class="dealer-shop-wallet">🪙 <span></span></div>
          <button class="dealer-shop-close" type="button" aria-label="ปิด">×</button>
        </div>
        <div class="dealer-draw">
          <button class="dealer-draw-btn" type="button"></button>
          <div class="dealer-result"></div>
        </div>
        <div class="dealer-shop-status"></div>
        <div class="dealer-lists"></div>
      </div>`;
    document.body.appendChild(this.root);
    this.coins = this.root.querySelector('.dealer-shop-wallet span')!;
    this.result = this.root.querySelector('.dealer-result')!;
    this.lists = this.root.querySelector('.dealer-lists')!;
    this.status = this.root.querySelector('.dealer-shop-status')!;
    this.drawBtn = this.root.querySelector('.dealer-draw-btn')!;

    this.root.querySelector<HTMLButtonElement>('.dealer-shop-close')!
      .addEventListener('click', () => this.close());
    this.drawBtn.addEventListener('click', () => void this.handleDraw());
    this.root.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-equip]');
      if (!button) return;
      const id = button.dataset.equip!;
      const kind = button.dataset.kind as ItemKind;
      this.inventory.equip(kind, id);
      this.onChange();
      this.render();
    });
    this.root.style.display = 'none';
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

  setStatus(message: string, danger = false): void {
    this.status.textContent = message;
    this.status.classList.toggle('danger', danger);
  }

  private async handleDraw(): Promise<void> {
    if (this.drawInFlight) return;
    this.drawInFlight = true;
    this.render();
    try {
      const drawn = await this.inventory.drawAsync();
      if (!drawn) {
        this.setStatus(`เหรียญไม่พอ ต้องการ ${this.inventory.drawCost} 🪙`, true);
        return;
      }
      this.showResult(drawn);
      this.onChange();
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : 'เชื่อมต่อร้านค้าไม่สำเร็จ', true);
    } finally {
      this.drawInFlight = false;
      this.render();
    }
  }

  private showResult(drawn: DrawResult): void {
    const { entry, isNew } = drawn;
    const color = RARITY_COLOR[entry.rarity];
    this.result.style.borderColor = color;
    this.result.innerHTML = `
      <div class="dealer-result-icon" style="color:${color}">${KIND_ICON[entry.kind]}</div>
      <div>
        <div class="dealer-result-name">${entry.name}</div>
        <div class="dealer-result-rarity" style="color:${color}">
          ${RARITY_LABEL[entry.rarity]} · ${KIND_LABEL[entry.kind]}
        </div>
        <div class="dealer-result-tag">${isNew ? '✨ ได้ของใหม่!' : 'มีอยู่แล้ว (สะสมซ้ำ)'}</div>
      </div>`;
    this.result.classList.add('show');
  }

  render(): void {
    this.coins.textContent = `${this.inventory.coins} เหรียญ`;
    this.drawBtn.textContent = `🎲 สุ่ม 1 ครั้ง · ${this.inventory.drawCost} 🪙`;
    this.drawBtn.disabled = this.drawInFlight || this.inventory.coins < this.inventory.drawCost;

    const snapshot = this.inventory.loadout.snapshot;
    const equippedOf: Record<ItemKind, string | null> = {
      sword: snapshot.equippedSwordId,
      gun: snapshot.equippedGunId,
      'fighting-style': snapshot.equippedFightingStyleId,
      fruit: snapshot.equippedFruitId,
    };

    this.lists.innerHTML = KIND_ORDER.map((kind) => {
      const owned = this.inventory.ownedOf(kind);
      const cards = owned.length
        ? owned.map((id) => this.card(kind, id, equippedOf[kind] === id)).join('')
        : `<div class="dealer-empty">ยังไม่มี — ลองสุ่มดูสิ!</div>`;
      return `<h3 class="dealer-section">${KIND_ICON[kind]} ${KIND_LABEL[kind]}</h3>
        <div class="dealer-cards">${cards}</div>`;
    }).join('');
  }

  private card(kind: ItemKind, id: string, isEquipped: boolean): string {
    const meta = itemMeta(kind, id);
    const color = RARITY_COLOR[meta.rarity];
    const label = isEquipped ? '✓ ติดตั้งอยู่' : 'ติดตั้ง';
    return `
      <div class="dealer-card${isEquipped ? ' equipped' : ''}" style="border-color:${color}55">
        <div class="dealer-card-icon">${KIND_ICON[kind]}</div>
        <div class="dealer-card-body">
          <h4>${meta.name}</h4>
          <div class="dealer-card-rarity" style="color:${color}">${RARITY_LABEL[meta.rarity]}</div>
        </div>
        <button type="button" data-equip="${id}" data-kind="${kind}" ${isEquipped ? 'disabled' : ''}>${label}</button>
      </div>`;
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      .dealer-shop-root { position:fixed; inset:0; z-index:76; display:flex; align-items:center; justify-content:center;
        padding:16px; box-sizing:border-box; background:rgba(2,12,20,.6); backdrop-filter:blur(5px);
        font-family:'Segoe UI',Tahoma,sans-serif; }
      .dealer-shop { width:min(760px,100%); max-height:90vh; overflow:auto; color:#edf9fa;
        background:linear-gradient(150deg,#1a1030,#241640); border:1px solid rgba(200,144,255,.5);
        border-radius:18px; padding:18px; box-shadow:0 16px 55px rgba(0,0,0,.6); }
      .dealer-shop-head { display:flex; align-items:flex-start; gap:14px; }
      .dealer-shop-head h2 { margin:0; color:#e6c8ff; font-size:20px; }
      .dealer-shop-head p { margin:4px 0 0; color:#b3a2cf; font-size:12px; }
      .dealer-shop-wallet { margin-left:auto; white-space:nowrap; color:#ffe69a; font-weight:800; font-size:13px;
        border:1px solid rgba(255,222,133,.35); border-radius:16px; padding:6px 10px; }
      .dealer-shop-close { border:0; color:#d7e5e7; background:transparent; font-size:28px; cursor:pointer; }
      .dealer-draw { display:flex; gap:14px; align-items:center; margin-top:16px; flex-wrap:wrap; }
      .dealer-draw-btn { border:0; border-radius:16px; padding:14px 22px; cursor:pointer; font-size:16px;
        color:#20122f; background:linear-gradient(120deg,#ffd76b,#ff9ad2); font-weight:800; touch-action:manipulation; }
      .dealer-draw-btn:disabled { opacity:.4; cursor:not-allowed; }
      .dealer-result { display:none; align-items:center; gap:12px; padding:10px 14px; border-radius:14px;
        border:2px solid transparent; background:rgba(0,0,0,.28); min-width:200px; }
      .dealer-result.show { display:flex; }
      .dealer-result-icon { font-size:40px; }
      .dealer-result-name { font-weight:800; font-size:15px; color:#fff; }
      .dealer-result-rarity { font-size:12px; font-weight:700; }
      .dealer-result-tag { font-size:11px; color:#cbb8e6; margin-top:2px; }
      .dealer-shop-status { min-height:16px; margin:10px 2px 0; color:#8ff0cd; font-size:12px; }
      .dealer-shop-status.danger { color:#ff927c; }
      .dealer-section { margin:16px 0 8px; color:#e6c8ff; font-size:14px; }
      .dealer-cards { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
      .dealer-card { display:grid; grid-template-columns:40px 1fr; gap:9px; padding:10px; border-radius:12px;
        border:1px solid rgba(150,130,200,.3); background:rgba(10,6,22,.5); }
      .dealer-card.equipped { box-shadow:inset 0 0 0 1px rgba(255,215,120,.4); background:rgba(40,26,66,.6); }
      .dealer-card-icon { font-size:26px; align-self:center; text-align:center; }
      .dealer-card-body h4 { margin:0; color:#fff1e8; font-size:13px; }
      .dealer-card-rarity { font-size:10px; font-weight:800; margin-top:2px; }
      .dealer-card>button { grid-column:1/-1; border:0; border-radius:12px; padding:7px; cursor:pointer;
        color:#20122f; background:#d9b8ff; font-weight:800; touch-action:manipulation; }
      .dealer-card>button:disabled { opacity:.55; cursor:default; background:#c8b8dd; }
      .dealer-empty { color:#a99ec4; font-size:12px; padding:6px 2px; }
      @media(max-width:650px){ .dealer-shop-root{ align-items:flex-end; padding:8px; }
        .dealer-shop{ max-height:82vh; padding:14px; } .dealer-cards{ grid-template-columns:1fr; } }
    `;
    document.head.appendChild(style);
  }
}
