import { isTouchDevice } from '../engine/device';
import type { IslandId } from '../island/IslandTypes';
import type { TradeManager } from '../trade/TradeManager';
import { cargoSlotsUsed } from '../trade/TradeFormulas';
import { filterActiveNews } from '../trade/living/LivingTradeNews';
import {
  batchSilentEvents,
  classifyLogEntry,
  classifyNewsItem,
  formatToastLine,
  mergeToastEvents,
  type ClassifiedEconomyEvent,
} from '../trade/living/EconomyEventClassifier';
import { CELL_LABELS } from '../trade/living/LivingTradeConfig';
import { LIVING_COMMODITY_META } from '../trade/living/ProductionRecipes';
import type { EconomyPanel } from './EconomyPanel';

const TOAST_DURATION_S = 2.5;

function rectsOverlap(a: DOMRect, b: DOMRect, pad = 6): boolean {
  return !(
    a.right + pad < b.left
    || a.left - pad > b.right
    || a.bottom + pad < b.top
    || a.top - pad > b.bottom
  );
}

/**
 * Mobile-first Economy HUD — chip กะทัดรัด + toast มุมซ้ายบน (ไม่บังตัวละครกลางจอ)
 */
export class EconomyMobileHUD {
  private readonly chip: HTMLDivElement;
  private readonly toast: HTMLDivElement;
  private readonly economyBtn: HTMLButtonElement;
  private toastTimer = 0;
  private toastQueue: ClassifiedEconomyEvent[] = [];
  private currentToast: ClassifiedEconomyEvent | null = null;
  private lastLogTick = -1;
  private eventHistory: ClassifiedEconomyEvent[] = [];
  private activeAlerts = new Map<string, ClassifiedEconomyEvent>();
  private panel: EconomyPanel | null = null;
  private onOpenPanel: (() => void) | null = null;
  private onOpenAlerts: (() => void) | null = null;

  constructor(private trade: TradeManager) {
    this.injectStyles();
    const minimapSize = isTouchDevice() ? 112 : 144;
    const chipTop = 14 + minimapSize + 8;

    this.chip = document.createElement('div');
    this.chip.className = 'eco-chip';
    this.chip.style.top = `${chipTop}px`;
    document.body.appendChild(this.chip);

    this.toast = document.createElement('div');
    this.toast.className = 'eco-toast';
    document.body.appendChild(this.toast);

    this.economyBtn = document.createElement('button');
    this.economyBtn.type = 'button';
    this.economyBtn.className = 'eco-open-btn';
    this.economyBtn.textContent = '📈';
    this.economyBtn.title = 'เปิดตลาด & เศรษฐกิจ';
    this.economyBtn.addEventListener('click', () => this.onOpenPanel?.());
    document.body.appendChild(this.economyBtn);

    this.chip.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.eco-chip-alert')) {
        this.onOpenAlerts?.();
      } else {
        this.onOpenPanel?.();
      }
    });
  }

  bindPanel(
    panel: EconomyPanel,
    onOpen: () => void,
    onOpenAlerts: () => void,
  ): void {
    this.panel = panel;
    this.onOpenPanel = onOpen;
    this.onOpenAlerts = onOpenAlerts;
  }

  getEventHistory(): readonly ClassifiedEconomyEvent[] {
    return this.eventHistory;
  }

  getActiveAlerts(): readonly ClassifiedEconomyEvent[] {
    return [...this.activeAlerts.values()];
  }

  ingestPlayerEvent(event: ClassifiedEconomyEvent): void {
    if (!event.toastEligible) return;
    this.toastQueue = mergeToastEvents(this.toastQueue, event);
    this.eventHistory.unshift(event);
    this.eventHistory = this.eventHistory.slice(0, 40);
    this.panel?.setEventHistory(this.eventHistory);
  }

  ingestTick(): void {
    const world = this.trade.living.state;
    if (world.tick === this.lastLogTick) return;
    this.lastLogTick = world.tick;

    const newLogs = this.trade.living.log.filter((e) => e.tick === world.tick);
    const classified = [
      ...newLogs.map((e) => classifyLogEntry(e)),
      ...filterActiveNews(this.trade.living.news)
        .slice(0, 2)
        .map((n) => classifyNewsItem(n)),
    ];

    const silentBatch = batchSilentEvents(classified);
    const toStore = classified.filter((e) => e.priority !== 'silent');
    if (silentBatch) this.eventHistory.unshift(silentBatch);
    this.eventHistory.unshift(...toStore);
    this.eventHistory = this.eventHistory.slice(0, 40);
    this.panel?.setEventHistory(this.eventHistory);

    for (const event of classified) {
      if (event.isAlert) {
        this.activeAlerts.set(event.mergeKey, event);
      }
    }
    this.panel?.setActiveAlerts(this.getActiveAlerts());

    const toastCandidates = classified
      .filter((e) => e.toastEligible)
      .sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority));

    for (const event of toastCandidates) {
      this.toastQueue = mergeToastEvents(this.toastQueue, event);
    }
  }

  update(
    dt: number,
    opts: { shopOpen: boolean; panelOpen: boolean; islandId: IslandId },
  ): void {
    if (opts.shopOpen || opts.panelOpen) {
      this.hideToast();
      this.chip.style.display = 'none';
      this.economyBtn.style.display = 'none';
      return;
    }
    this.economyBtn.style.display = '';

    this.ingestTick();
    this.renderChip();
    this.advanceToastQueue(dt);
    this.positionToast();
  }

  private advanceToastQueue(dt: number): void {
    if (this.currentToast) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) {
        this.currentToast = null;
        this.hideToast();
      }
      return;
    }
    if (!this.toastQueue.length) return;
    const next = this.toastQueue.shift()!;
    this.showToast(next);
  }

  private renderChip(): void {
    const hold = this.trade.hold;
    const slots = cargoSlotsUsed(hold.slots);
    const coins = this.trade.walletCoins.toLocaleString('th-TH');
    const alertCount = this.activeAlerts.size;

    const tracked = this.trade.trackedContract;
    const contractHtml = tracked
      ? `<span class="eco-chip-contract">📦 ${LIVING_COMMODITY_META[tracked.commodityId].label.slice(0, 4)} ${tracked.deliveredAmount}/${tracked.requestedAmount}→${CELL_LABELS[tracked.destinationIslandId].slice(0, 4)}</span>`
      : '';

    this.chip.style.display = 'flex';
    this.chip.innerHTML = `
      <span class="eco-chip-coins">💰 ${coins}</span>
      <span class="eco-chip-cargo">📦 ${slots}/${hold.maxSlots}</span>
      ${contractHtml}
      ${alertCount > 0
        ? `<button type="button" class="eco-chip-alert" aria-label="แจ้งเตือนเศรษฐกิจ">⚠️ ${alertCount}</button>`
        : ''}`;
  }

  private showToast(event: ClassifiedEconomyEvent): void {
    this.currentToast = event;
    this.toastTimer = TOAST_DURATION_S;
    const line = formatToastLine(event);
    this.toast.textContent = line;
    this.toast.classList.toggle('eco-toast-critical', event.priority === 'critical');
    this.toast.style.display = 'flex';
    this.toast.classList.add('eco-toast-visible');
    this.positionToast();
  }

  private hideToast(): void {
    this.toast.classList.remove('eco-toast-visible', 'eco-toast-critical');
    this.toast.style.display = 'none';
  }

  /** วาง toast ข้างขวา chip แถวเดียวกัน — ไม่บังกลางจอ */
  private positionToast(): void {
    if (this.toast.style.display === 'none') return;

    const chipEl = this.chip;
    const chipRect = chipEl.getBoundingClientRect();
    const gap = 8;

    let left = chipRect.right + gap;
    let top = chipRect.top;

    const maxWidth = Math.min(260, window.innerWidth - left - 12);
    this.toast.style.maxWidth = `${Math.max(120, maxWidth)}px`;
    this.toast.style.left = `${left}px`;
    this.toast.style.right = 'auto';
    this.toast.style.top = `${top}px`;
    this.toast.style.transform = 'none';

    const blockers = ['.hud-info', '.graphics-setting', '.trade-route-hint', '.eco-open-btn'];

    for (let attempt = 0; attempt < 2; attempt++) {
      const toastRect = this.toast.getBoundingClientRect();
      if (toastRect.right <= window.innerWidth - 8) {
        let hit = false;
        for (const sel of blockers) {
          const el = document.querySelector(sel);
          if (!el) continue;
          if (rectsOverlap(toastRect, el.getBoundingClientRect())) {
            hit = true;
            break;
          }
        }
        if (!hit) return;
      }
      // ไม่พอที่ขวา → วางซ้าย chip แทน
      left = Math.max(8, chipRect.left - toastRect.width - gap);
      this.toast.style.left = `${left}px`;
    }
  }

  private injectStyles(): void {
    if (document.getElementById('eco-mobile-hud-styles')) return;
    const style = document.createElement('style');
    style.id = 'eco-mobile-hud-styles';
    const minimapSize = isTouchDevice() ? 112 : 144;
    const chipTop = 14 + minimapSize + 8;
    style.textContent = `
      .eco-chip{position:fixed;z-index:20;left:14px;top:${chipTop}px;max-width:min(280px,88vw);height:34px;
        display:flex;align-items:center;gap:10px;padding:0 10px;box-sizing:border-box;
        background:rgba(6,28,32,.88);border:1px solid rgba(120,200,170,.35);border-radius:10px;
        color:#dff7ee;font:600 10px 'Segoe UI',Tahoma,sans-serif;
        pointer-events:auto;touch-action:manipulation;overflow:hidden}
      .eco-chip-coins{color:#ffe49a;white-space:nowrap}
      .eco-chip-cargo{color:#b8e8d4;white-space:nowrap}
      .eco-chip-contract{color:#c8e0ff;white-space:nowrap;font-size:9px}
      .eco-chip-alert{margin-left:auto;border:0;background:rgba(255,180,80,.15);color:#ffb86c;
        border-radius:8px;padding:2px 7px;font:inherit;cursor:pointer;white-space:nowrap;
        touch-action:manipulation}
      .eco-chip-alert:active{transform:scale(.95)}
      .eco-toast{position:fixed;z-index:30;left:auto;right:auto;
        max-width:min(260px,52vw);height:34px;max-height:36px;
        display:none;align-items:center;justify-content:center;padding:0 12px;box-sizing:border-box;
        background:rgba(8,32,38,.92);border:1px solid rgba(140,220,190,.4);border-radius:10px;
        color:#e8f8f0;font:600 10px 'Segoe UI',Tahoma,sans-serif;pointer-events:none;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0;
        transition:opacity .2s ease}
      .eco-toast.eco-toast-visible{opacity:1}
      .eco-toast.eco-toast-critical{background:rgba(100,18,18,.9);
        border-color:rgba(255,140,120,.55);color:#fff}
      .eco-open-btn{position:fixed;z-index:20;left:${14 + minimapSize - 36}px;top:14px;
        width:34px;height:34px;border-radius:50%;border:1px solid rgba(120,200,170,.45);
        background:rgba(6,28,32,.9);color:#fff;font-size:16px;cursor:pointer;
        touch-action:manipulation;box-shadow:0 2px 8px rgba(0,0,0,.35)}
      .eco-open-btn:active{transform:scale(.94)}
      @media(max-width:599px){
        .eco-chip{height:32px;font-size:9px;gap:8px}
        .eco-toast{height:32px;font-size:9px;max-width:min(220px,48vw)}
      }
      @media(min-width:701px){
        .eco-chip{max-width:300px;height:32px;font-size:11px}
        .eco-toast{max-width:280px}
        .eco-open-btn{left:${14 + 144 - 36}px}
      }
    `;
    document.head.appendChild(style);
  }
}

function priorityRank(p: ClassifiedEconomyEvent['priority']): number {
  return { silent: 0, low: 1, medium: 2, high: 3, critical: 4 }[p];
}
