import type { TradeManager } from '../trade/TradeManager';
import { TRADE_COMMODITIES } from '../trade/databook/commodities';
import { cargoSlotsUsed, cargoTotalWeight } from '../trade/TradeFormulas';

/** แสดง cargo บนเรือมุมขวาล่าง */
export class CargoHUD {
  private readonly root: HTMLDivElement;

  constructor(private trade: TradeManager) {
    const style = document.createElement('style');
    style.textContent = `
      .cargo-hud{position:fixed;z-index:17;right:16px;bottom:92px;min-width:120px;max-width:200px;
        padding:8px 10px;pointer-events:none;box-sizing:border-box;
        background:rgba(6,24,32,.82);border:1px solid rgba(120,190,170,.3);border-radius:10px;
        color:#dff7ee;font:600 10px 'Segoe UI',Tahoma,sans-serif;display:none}
      .cargo-hud-title{color:#ffe08a;font-size:11px;margin-bottom:4px}
      .cargo-hud-line{color:#b8e8d4;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .cargo-hud-meta{color:#8eb5aa;font-size:9px;margin-top:4px}
      @media(max-width:700px){.cargo-hud{right:8px;bottom:86px;font-size:9px}}
    `;
    document.head.appendChild(style);
    this.root = document.createElement('div');
    this.root.className = 'cargo-hud';
    document.body.appendChild(this.root);
  }

  refresh(): void {
    const hold = this.trade.hold;
    if (!hold.slots.length) {
      this.root.style.display = 'none';
      return;
    }
    const weight = cargoTotalWeight(hold.slots, TRADE_COMMODITIES);
    const slots = cargoSlotsUsed(hold.slots);
    const lines = hold.slots.map((slot) => {
      const c = TRADE_COMMODITIES.find((x) => x.id === slot.commodityId);
      return `<div class="cargo-hud-line">${c?.icon ?? '📦'} ${c?.nameTh ?? slot.commodityId} ×${slot.quantity}</div>`;
    }).join('');
    this.root.style.display = 'block';
    this.root.innerHTML = `
      <div class="cargo-hud-title">📦 Cargo เรือ</div>
      ${lines}
      <div class="cargo-hud-meta">${slots}/${hold.maxSlots} ช่อง · ${weight}/${hold.maxWeight} น้ำหนัก</div>`;
  }
}
