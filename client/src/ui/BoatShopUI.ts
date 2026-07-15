import { BOAT_DEFINITIONS } from '../boat/BoatData';
import type { BoatUpgradeKind } from '../boat/BoatData';
import type { Boat } from '../boat/Boat';
import type { BoatProgress } from '../boat/BoatProgress';

export type BoatShopAction = 'purchase' | 'select' | 'summon' | 'store' | 'repair' | 'upgrade-hull' | 'upgrade-cannon' | 'upgrade-sail';

export class BoatShopUI {
  private readonly root: HTMLDivElement;
  private readonly cards: HTMLDivElement;
  private readonly coins: HTMLSpanElement;
  private readonly status: HTMLDivElement;
  private closeCallback: (() => void) | null = null;

  constructor(
    private progress: BoatProgress,
    private getActiveBoat: () => Boat | null,
    private onAction: (action: BoatShopAction, boatId?: string) => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'boat-shop-root';
    this.root.innerHTML = `
      <div class="boat-shop">
        <div class="boat-shop-head">
          <div><h2>⚓ อู่เรือกัปตันคราม</h2><p>เลือกเรือสำหรับออกสำรวจทะเล</p></div>
          <div class="boat-shop-wallet">🪙 <span></span></div>
          <button class="boat-shop-close" type="button" aria-label="ปิด">×</button>
        </div>
        <div class="boat-shop-cards"></div>
        <div class="boat-shop-status"></div>
        <div class="boat-shop-foot">
          <button data-action="repair" type="button">🔧 ซ่อมเรือ</button>
          <button data-action="store" type="button">📦 เก็บเรือ</button>
        </div>
      </div>`;
    document.body.appendChild(this.root);
    this.cards = this.root.querySelector('.boat-shop-cards')!;
    this.coins = this.root.querySelector('.boat-shop-wallet span')!;
    this.status = this.root.querySelector('.boat-shop-status')!;
    this.root.querySelector<HTMLButtonElement>('.boat-shop-close')!.addEventListener('click', () => this.close());
    this.root.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
      if (!button) return;
      const action = button.dataset.action as BoatShopAction;
      this.onAction(action, button.dataset.boatId);
      this.render();
    });
    this.injectStyles();
    this.root.style.display = 'none';
  }

  get isOpen(): boolean {
    return this.root.style.display !== 'none';
  }

  open(onClose: () => void): void {
    if (document.pointerLockElement) document.exitPointerLock();
    this.closeCallback = onClose;
    this.root.style.display = 'flex';
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

  render(): void {
    this.coins.textContent = `${this.progress.coins} เหรียญ`;
    const active = this.getActiveBoat();
    this.cards.innerHTML = '';
    for (const definition of BOAT_DEFINITIONS) {
      const owned = this.progress.owns(definition.id);
      const selected = this.progress.selectedBoatId === definition.id;
      const runtime = this.progress.getRuntimeDefinition(definition.id) ?? definition;
      const card = document.createElement('div');
      card.className = `boat-card${selected ? ' selected' : ''}`;
      const price = definition.price === 0 ? 'ฟรี' : `${definition.price} เหรียญ`;
      let action: BoatShopAction = 'purchase';
      let label = definition.price === 0 ? 'รับเรือฟรี' : `ซื้อ · ${price}`;
      if (owned && !selected) {
        action = 'select';
        label = 'เลือกเรือลำนี้';
      } else if (owned && selected) {
        action = 'summon';
        label = active?.definition.id === definition.id ? 'เรียกใหม่ที่ท่า' : 'เรียกเรือ';
      }
      const upgradeButton = (kind: BoatUpgradeKind, icon: string, label: string): string => {
        const level = this.progress.upgradeLevel(definition.id, kind);
        const cost = this.progress.upgradeCost(definition.id, kind);
        const detail = cost === null ? 'เต็ม' : `Lv.${level}→${level + 1} · ${cost}🪙`;
        return `<button type="button" data-action="upgrade-${kind}" data-boat-id="${definition.id}"${cost === null ? ' disabled' : ''}>${icon} ${label} ${detail}</button>`;
      };
      card.innerHTML = `
        <div class="boat-card-icon">${definition.hasSail ? '⛵' : '🛶'}</div>
        <div class="boat-card-body"><h3>${definition.name}</h3><p>${definition.description}</p>
          <div class="boat-stats"><span>เร็ว ${runtime.maxSpeed.toFixed(1)}</span><span>HP ${runtime.maxHp}</span><span>ปืน ${runtime.cannonsPerSide ?? 0}/กราบ</span>
            <span>${owned ? '✓ เป็นเจ้าของ' : price}</span></div></div>
        <button type="button" data-action="${action}" data-boat-id="${definition.id}">${label}</button>
        ${owned ? `<div class="boat-upgrade-title">อัปเกรดเรือ · เรียกเรือใหม่เพื่อใช้ค่าสถานะ</div><div class="boat-upgrades">${upgradeButton('hull', '🛡️', 'เกราะ')}${upgradeButton('cannon', '💣', 'ปืน')}${upgradeButton('sail', '⛵', 'ใบ')}</div>` : ''}`;
      this.cards.appendChild(card);
    }
    const repair = this.root.querySelector<HTMLButtonElement>('button[data-action="repair"]')!;
    const store = this.root.querySelector<HTMLButtonElement>('button[data-action="store"]')!;
    repair.disabled = !active || active.hp >= active.definition.maxHp;
    store.disabled = !active;
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      .boat-shop-root { position:fixed; inset:0; z-index:75; display:flex; align-items:center; justify-content:center;
        padding:16px; box-sizing:border-box; background:rgba(2,12,20,.58); backdrop-filter:blur(5px);
        font-family:'Segoe UI',Tahoma,sans-serif; }
      .boat-shop { width:min(720px,100%); max-height:88vh; overflow:auto; color:#edf9fa;
        background:linear-gradient(150deg,#092534,#123d48); border:1px solid rgba(255,213,116,.52);
        border-radius:18px; padding:18px; box-shadow:0 16px 55px rgba(0,0,0,.58); }
      .boat-shop-head { display:flex; align-items:flex-start; gap:14px; }
      .boat-shop-head h2 { margin:0; color:#ffdd82; font-size:20px; }
      .boat-shop-head p { margin:4px 0 0; color:#9fbec4; font-size:12px; }
      .boat-shop-wallet { margin-left:auto; white-space:nowrap; color:#ffe69a; font-weight:800; font-size:13px;
        border:1px solid rgba(255,222,133,.35); border-radius:16px; padding:6px 10px; }
      .boat-shop-close { border:0; color:#d7e5e7; background:transparent; font-size:28px; cursor:pointer; }
      .boat-shop-cards { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin-top:16px; }
      .boat-card { display:grid; grid-template-columns:62px 1fr; gap:10px; padding:13px; border-radius:13px;
        border:1px solid rgba(132,193,204,.28); background:rgba(3,21,29,.48); }
      .boat-card.selected { border-color:#ffda78; box-shadow:inset 0 0 0 1px rgba(255,218,120,.25); }
      .boat-card-icon { font-size:40px; align-self:center; text-align:center; }
      .boat-card h3 { margin:0; color:#fff1c6; font-size:15px; }
      .boat-card p { margin:5px 0 8px; color:#abc2c6; font-size:11px; line-height:1.45; }
      .boat-stats { display:flex; flex-wrap:wrap; gap:5px; }
      .boat-stats span { padding:3px 7px; border-radius:10px; background:rgba(106,177,190,.17); font-size:10px; }
      .boat-card>button { grid-column:1/-1; border:0; border-radius:14px; padding:8px; cursor:pointer;
        color:#17252a; background:#ffda7a; font-weight:800; touch-action:manipulation; }
      .boat-upgrade-title { grid-column:1/-1; color:#a9d9c8; font-size:9px; margin-top:2px; }
      .boat-upgrades { grid-column:1/-1; display:flex; gap:5px; flex-wrap:wrap; }
      .boat-upgrades button { border:1px solid rgba(153,216,227,.35); border-radius:10px; padding:5px 7px; color:#dceff0; background:rgba(4,21,29,.65); font-size:10px; cursor:pointer; }
      .boat-upgrades button small { color:#ffdf8a; }
      .boat-shop-status { min-height:18px; margin:10px 2px 0; color:#8ff0cd; font-size:12px; }
      .boat-shop-status.danger { color:#ff927c; }
      .boat-shop-foot { display:flex; justify-content:flex-end; gap:8px; margin-top:8px; }
      .boat-shop-foot button { border:1px solid rgba(153,216,227,.35); border-radius:13px; padding:7px 12px;
        color:#e8f4f5; background:rgba(4,21,29,.55); font-weight:700; cursor:pointer; }
      .boat-shop button:disabled { opacity:.4; cursor:not-allowed; }
      @media(max-width:650px) { .boat-shop-root { align-items:flex-end; padding:8px; }
        .boat-shop { max-height:78vh; padding:14px; } .boat-shop-cards { grid-template-columns:1fr; }
        .boat-card { grid-template-columns:48px 1fr; } .boat-card-icon { font-size:32px; } }
    `;
    document.head.appendChild(style);
  }
}
