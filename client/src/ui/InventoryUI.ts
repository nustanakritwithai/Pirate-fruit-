import type { ItemInventory } from '../shop/ItemInventory';
import { KIND_ICON, KIND_LABEL, RARITY_COLOR, RARITY_LABEL, type ItemKind, type Rarity } from '../shop/GachaData';
import { getSword } from '../swords/SwordRegistry';
import { getGun } from '../guns/GunRegistry';
import { getFightingStyle } from '../fighting-styles/FightingStyleRegistry';
import { getFruit } from '../fruit/FruitRegistry';
import { POTIONS } from '../shop/PotionData';

function itemMeta(kind: ItemKind, id: string): { name: string; rarity: Rarity } {
  switch (kind) {
    case 'sword': { const s = getSword(id); return { name: s?.nameTh ?? id, rarity: s?.rarity ?? 'common' }; }
    case 'gun': { const g = getGun(id); return { name: g?.nameTh ?? id, rarity: g?.rarity ?? 'common' }; }
    case 'fighting-style': { const st = getFightingStyle(id); return { name: st?.nameTh ?? id, rarity: 'common' }; }
    case 'fruit': { const f = getFruit(id); return { name: f?.nameTh ?? id, rarity: f?.rarity ?? 'common' }; }
  }
}

/** หมวดอาวุธที่ "ติดตั้ง" ได้ (ผลไม้แยกไปโชว์ปุ่ม "กิน") */
const WEAPON_KINDS: ItemKind[] = ['fighting-style', 'sword', 'gun'];

/**
 * กระเป๋าเก็บของ — เปิดได้ทุกเมื่อ (ปุ่ม 🎒 / คีย์ B)
 * - อาวุธ: ติดตั้ง · ผลไม้: กิน · ยา: จัดลงช่องลัด 1/2
 */
export class InventoryUI {
  private readonly root: HTMLDivElement;
  private readonly openButton: HTMLButtonElement;
  private readonly content: HTMLDivElement;
  private openState = false;

  constructor(
    private inventory: ItemInventory,
    private onChange: () => void,
    private onVisibilityChanged: (open: boolean) => void,
  ) {
    this.injectStyles();
    this.openButton = document.createElement('button');
    this.openButton.className = 'inv-open-button';
    this.openButton.type = 'button';
    this.openButton.title = 'กระเป๋า (B)';
    this.openButton.textContent = '🎒';
    this.openButton.addEventListener('click', () => this.toggle());
    document.body.appendChild(this.openButton);

    this.root = document.createElement('div');
    this.root.className = 'inv-root';
    this.root.innerHTML = `
      <section class="inv-panel" role="dialog" aria-label="Inventory">
        <header><h2>🎒 กระเป๋าเก็บของ</h2>
          <button class="inv-close" type="button" aria-label="ปิด">×</button></header>
        <div class="inv-content"></div>
        <footer>อาวุธ = ติดตั้ง · ผลไม้ = กิน · ยา = จัดลงช่องลัด (Z/X)</footer>
      </section>`;
    document.body.appendChild(this.root);
    this.content = this.root.querySelector('.inv-content')!;
    this.root.querySelector<HTMLButtonElement>('.inv-close')!.addEventListener('click', () => this.close());

    this.root.addEventListener('click', (event) => {
      const el = event.target as HTMLElement;
      const equipBtn = el.closest<HTMLButtonElement>('button[data-equip]');
      if (equipBtn) {
        this.inventory.equip(equipBtn.dataset.kind as ItemKind, equipBtn.dataset.equip!);
        this.onChange();
        this.render();
        return;
      }
      const slotBtn = el.closest<HTMLButtonElement>('button[data-assign]');
      if (slotBtn) {
        this.inventory.assignQuickslot(Number(slotBtn.dataset.slot), slotBtn.dataset.assign!);
        this.onChange();
        this.render();
      }
    });

    window.addEventListener('keydown', (event) => {
      if (event.code === 'KeyB' && !event.repeat && !this.isTypingTarget(event)) this.toggle();
      if (event.code === 'Escape' && this.openState) this.close();
    });
    this.root.style.display = 'none';
  }

  open(): void {
    if (this.openState) return;
    if (document.pointerLockElement) document.exitPointerLock();
    this.openState = true;
    this.root.style.display = 'flex';
    this.render();
    this.onVisibilityChanged(true);
  }

  close(): void {
    if (!this.openState) return;
    this.openState = false;
    this.root.style.display = 'none';
    this.onVisibilityChanged(false);
  }

  private toggle(): void {
    if (this.openState) this.close();
    else this.open();
  }

  private isTypingTarget(event: KeyboardEvent): boolean {
    const t = event.target as HTMLElement | null;
    return Boolean(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable));
  }

  private render(): void {
    const snapshot = this.inventory.loadout.snapshot;
    const equippedOf: Record<ItemKind, string | null> = {
      sword: snapshot.equippedSwordId,
      gun: snapshot.equippedGunId,
      'fighting-style': snapshot.equippedFightingStyleId,
      fruit: snapshot.equippedFruitId,
    };
    const sections: string[] = [];

    // ---- อาวุธ (ติดตั้ง) ----
    for (const kind of WEAPON_KINDS) {
      const owned = this.inventory.ownedOf(kind);
      if (!owned.length) continue;
      const cards = owned
        .map((id) => this.gearCard(kind, id, equippedOf[kind] === id, 'ติดตั้ง', '✓ ใช้อยู่'))
        .join('');
      sections.push(`<h3 class="inv-section">${KIND_ICON[kind]} ${KIND_LABEL[kind]}</h3><div class="inv-cards">${cards}</div>`);
    }

    // ---- ผลไม้ (กิน) ----
    const fruits = this.inventory.ownedOf('fruit');
    const fruitCards = fruits.length
      ? fruits.map((id) => this.gearCard('fruit', id, equippedOf.fruit === id, '🍴 กิน', '✓ กินอยู่')).join('')
      : `<div class="inv-empty">ยังไม่มีผลไม้ — สุ่มที่ร้านดีลเลอร์</div>`;
    sections.push(`<h3 class="inv-section">${KIND_ICON.fruit} ${KIND_LABEL.fruit}</h3><div class="inv-cards">${fruitCards}</div>`);

    // ---- ยา (จัดลงช่องลัด) ----
    const potions = this.inventory.listConsumables();
    const quickslots = this.inventory.quickslots;
    const potionCards = potions.length
      ? potions.map(({ id, count }) => {
          const p = POTIONS[id];
          const inSlot = quickslots.indexOf(id);
          const slotBtns = [0, 1]
            .map((s) => {
              const active = quickslots[s] === id;
              return `<button type="button" data-assign="${id}" data-slot="${s}" ${active ? 'disabled' : ''}>${active ? `อยู่ช่อง ${s + 1}` : `ช่อง ${s + 1}`}</button>`;
            })
            .join('');
          return `
            <div class="inv-card${inSlot >= 0 ? ' assigned' : ''}">
              <div class="inv-card-icon">${p.icon}</div>
              <div class="inv-card-body"><h4>${p.nameTh} ×${count}</h4>
                <div class="inv-card-sub">ฟื้น ${p.restore} ${p.kind === 'hp' ? 'HP' : 'MP'}</div></div>
              <div class="inv-slot-btns">${slotBtns}</div>
            </div>`;
        }).join('')
      : `<div class="inv-empty">ยังไม่มียา — ซื้อที่ร้านพ่อค้าเปา</div>`;
    sections.push(`<h3 class="inv-section">🧪 ยาฟื้นฟู (ช่องลัด Z/X)</h3><div class="inv-cards">${potionCards}</div>`);

    this.content.innerHTML = sections.join('');
  }

  private gearCard(kind: ItemKind, id: string, isEquipped: boolean, label: string, equippedLabel: string): string {
    const meta = itemMeta(kind, id);
    const color = RARITY_COLOR[meta.rarity];
    return `
      <div class="inv-card${isEquipped ? ' assigned' : ''}" style="border-color:${color}55">
        <div class="inv-card-icon">${KIND_ICON[kind]}</div>
        <div class="inv-card-body"><h4>${meta.name}</h4>
          <div class="inv-card-sub" style="color:${color}">${RARITY_LABEL[meta.rarity]}</div></div>
        <button type="button" data-equip="${id}" data-kind="${kind}" ${isEquipped ? 'disabled' : ''}>${isEquipped ? equippedLabel : label}</button>
      </div>`;
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      .inv-open-button { position:fixed; z-index:31; right:16px; top:130px; width:38px; height:38px;
        border:1px solid rgba(120,235,150,.5); border-radius:50%; color:#fff; background:rgba(6,34,20,.78);
        box-shadow:0 3px 12px rgba(0,0,0,.35); cursor:pointer; font-size:17px; touch-action:manipulation; }
      .inv-root { position:fixed; inset:0; z-index:79; display:flex; align-items:center; justify-content:center;
        padding:14px; box-sizing:border-box; background:rgba(1,10,8,.62); backdrop-filter:blur(5px);
        font-family:'Segoe UI',Tahoma,sans-serif; }
      .inv-panel { width:min(560px,100%); max-height:88vh; overflow:auto; color:#eafaf1;
        border:1px solid rgba(120,235,150,.45); border-radius:17px; padding:16px;
        background:linear-gradient(150deg,#07231a,#0c3a2a); box-shadow:0 16px 50px rgba(0,0,0,.55); }
      .inv-panel header { display:flex; align-items:center; justify-content:space-between; }
      .inv-panel h2 { margin:0; color:#b6f7cd; font-size:19px; }
      .inv-close { border:0; background:transparent; color:#d9e9e2; font-size:27px; cursor:pointer; }
      .inv-section { margin:15px 0 7px; color:#b6f7cd; font-size:13px; }
      .inv-cards { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; }
      .inv-card { display:grid; grid-template-columns:38px 1fr; gap:8px; padding:9px; border-radius:11px;
        border:1px solid rgba(120,200,150,.28); background:rgba(4,20,13,.5); }
      .inv-card.assigned { box-shadow:inset 0 0 0 1px rgba(255,215,120,.4); background:rgba(20,48,32,.6); }
      .inv-card-icon { font-size:24px; align-self:center; text-align:center; }
      .inv-card-body h4 { margin:0; color:#f1fff5; font-size:12.5px; }
      .inv-card-sub { font-size:10px; font-weight:800; margin-top:2px; color:#9fd7b4; }
      .inv-card>button { grid-column:1/-1; border:0; border-radius:10px; padding:6px; cursor:pointer;
        color:#0d2417; background:#7ce6a0; font-weight:800; touch-action:manipulation; }
      .inv-card>button:disabled { opacity:.55; cursor:default; background:#a9d6bb; }
      .inv-slot-btns { grid-column:1/-1; display:grid; grid-template-columns:1fr 1fr; gap:6px; }
      .inv-slot-btns>button { border:0; border-radius:10px; padding:6px; cursor:pointer; font-size:11px;
        color:#0d2417; background:#8fd7ff; font-weight:800; touch-action:manipulation; }
      .inv-slot-btns>button:disabled { opacity:.7; cursor:default; background:#ffd76b; }
      .inv-empty { color:#9ab6a8; font-size:12px; padding:6px 2px; grid-column:1/-1; }
      .inv-panel footer { margin-top:14px; color:#82ac95; font-size:10px; text-align:center; }
      @media(max-width:650px){ .inv-open-button{right:8px;top:126px;width:30px;height:30px;font-size:14px}
        .inv-root{align-items:flex-end;padding:8px}.inv-panel{max-height:82vh}.inv-cards{grid-template-columns:1fr} }
    `;
    document.head.appendChild(style);
  }
}
