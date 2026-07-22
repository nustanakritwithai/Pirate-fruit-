/**
 * คีย์ลัดใช้ยา (quickslot) — อ่านคำสั่งใช้ยาแต่ละเฟรม แล้วฟื้น HP/MP
 * ทำงานแยกจาก combat state (ใช้ได้แม้ตอนร่ายสกิล/บล็อก)
 */

import type { Updatable } from '../engine/Game';
import type { Input } from '../engine/Input';
import type { CharacterController } from '../player/CharacterController';
import type { ItemInventory } from '../shop/ItemInventory';
import type { TouchControls } from '../ui/TouchControls';
import { getPotion } from '../shop/PotionData';

/** คูลดาวน์ใช้ยาร่วม (วินาที) กันรัวขวด */
const POTION_COOLDOWN = 1.2;
/** ป้ายคีย์ต่อช่อง (desktop) */
const SLOT_KEYS = ['Z', 'X'];

export class HotkeyManager implements Updatable {
  private cooldown = 0;
  private lastSig = '';
  private readonly bar: HTMLDivElement | null;
  private readonly slotEls: HTMLDivElement[] = [];

  constructor(
    private input: Input,
    private controller: CharacterController,
    private inventory: ItemInventory,
    private touch: TouchControls | null,
    isTouchDevice: boolean,
    private readonly getCombatState: () => string = () => 'idle',
  ) {
    // แถบ quickslot บนจอ — เฉพาะเดสก์ท็อป (มือถือใช้ปุ่ม TouchControls)
    this.bar = isTouchDevice ? null : this.buildBar();
    this.refresh();
  }

  update(dt: number): void {
    if (this.cooldown > 0) this.cooldown -= dt;

    const slot = this.input.consumePotion();
    if (slot >= 1 && this.cooldown <= 0) this.usePotion(slot - 1);

    // อัปเดต UI เมื่อจำนวน/การจัดช่องเปลี่ยน
    const sig = this.slotSignature();
    if (sig !== this.lastSig) {
      this.lastSig = sig;
      this.refresh();
    }
  }

  /** เรียกหลังซื้อ/จัดช่องจากกระเป๋า/ร้าน เพื่ออัปเดตไอคอนทันที */
  refresh(): void {
    const slots = this.slotViews();
    this.touch?.setPotionSlots(slots);
    if (!this.bar) return;
    for (let i = 0; i < this.slotEls.length; i++) {
      const s = slots[i];
      const icon = this.slotEls[i].querySelector<HTMLElement>('.hk-icon')!;
      const count = this.slotEls[i].querySelector<HTMLElement>('.hk-count')!;
      icon.textContent = s ? s.icon : '➕';
      count.textContent = s && s.count > 0 ? String(s.count) : '';
      this.slotEls[i].classList.toggle('hk-empty', !s || s.count <= 0);
    }
  }

  private usePotion(slot: number): void {
    if (
      this.controller.hp <= 0
      || ['stunned', 'knockback', 'knockdown', 'dead'].includes(this.getCombatState())
    ) {
      this.touch?.notify('ติดสถานะอยู่ — ยังใช้ยาไม่ได้');
      return;
    }
    const id = this.inventory.getQuickslot(slot);
    if (!id) {
      this.touch?.notify('ช่องลัดว่าง — จัดยาที่กระเป๋า (B)');
      return;
    }
    const potion = getPotion(id);
    if (!potion) return;
    if (!this.inventory.useConsumable(id)) {
      this.touch?.notify(`ไม่มี${potion.nameTh} แล้ว`);
      return;
    }
    if (potion.kind === 'hp') {
      this.controller.hp = Math.min(this.controller.hpMax, this.controller.hp + potion.restore);
      this.touch?.notify(`❤️ +${potion.restore} HP`);
    } else {
      this.controller.mp = Math.min(this.controller.mpMax, this.controller.mp + potion.restore);
      this.touch?.notify(`🔵 +${potion.restore} MP`);
    }
    this.cooldown = POTION_COOLDOWN;
    this.refresh();
  }

  /** มุมมองแต่ละช่อง: {icon, count} หรือ undefined ถ้าว่าง */
  private slotViews(): ({ icon: string; count: number } | undefined)[] {
    return this.inventory.quickslots.map((id) => {
      if (!id) return undefined;
      const potion = getPotion(id);
      if (!potion) return undefined;
      return { icon: potion.icon, count: this.inventory.getConsumableCount(id) };
    });
  }

  private slotSignature(): string {
    return this.inventory.quickslots
      .map((id) => `${id ?? '-'}:${id ? this.inventory.getConsumableCount(id) : 0}`)
      .join('|');
  }

  private buildBar(): HTMLDivElement {
    const style = document.createElement('style');
    style.textContent = `
      .hotkey-bar { position:fixed; z-index:19; left:16px; bottom:16px; display:flex; gap:8px;
        pointer-events:none; font-family:'Segoe UI',Tahoma,sans-serif; }
      .hk-slot { position:relative; width:46px; height:46px; border-radius:11px; color:#eafff2;
        background:linear-gradient(145deg,rgba(6,28,18,.82),rgba(12,52,32,.72));
        border:1px solid rgba(120,235,150,.5); box-shadow:0 3px 12px rgba(0,0,0,.35);
        display:flex; align-items:center; justify-content:center; font-size:22px; }
      .hk-slot.hk-empty { opacity:.5; filter:saturate(.4); }
      .hk-key { position:absolute; left:3px; top:1px; font-size:9px; font-weight:800; color:#bfe8c9; }
      .hk-count { position:absolute; right:-3px; bottom:-4px; min-width:16px; height:16px; padding:0 3px;
        border-radius:8px; background:#1b6b3a; color:#fff; font-size:10px; line-height:16px; text-align:center;
        font-weight:800; box-shadow:0 1px 3px rgba(0,0,0,.5); }
      @media(max-width:700px){ .hotkey-bar{ display:none; } }
    `;
    document.head.appendChild(style);
    const bar = document.createElement('div');
    bar.className = 'hotkey-bar';
    for (let i = 0; i < this.inventory.quickslots.length; i++) {
      const slot = document.createElement('div');
      slot.className = 'hk-slot hk-empty';
      slot.innerHTML = `<span class="hk-key">${SLOT_KEYS[i] ?? ''}</span><span class="hk-icon">➕</span><span class="hk-count"></span>`;
      bar.appendChild(slot);
      this.slotEls.push(slot);
    }
    document.body.appendChild(bar);
    return bar;
  }
}
