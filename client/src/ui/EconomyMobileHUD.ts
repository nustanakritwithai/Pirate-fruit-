import { isTouchDevice } from '../engine/device';
import type { IslandId } from '../island/IslandTypes';
import type { TradeManager } from '../trade/TradeManager';
import { TRADE_COMMODITIES } from '../trade/databook/commodities';
import { cargoSlotsUsed } from '../trade/TradeFormulas';
import { filterActiveNews } from '../trade/living/LivingTradeNews';
import {
  batchSilentEvents,
  classifyLogEntry,
  classifyNewsItem,
  type ClassifiedEconomyEvent,
  type EconomyEventPriority,
} from '../trade/living/EconomyEventClassifier';
import type { EconomyPanel } from './EconomyPanel';

const TOAST_DURATION: Record<EconomyEventPriority, number> = {
  silent: 0,
  low: 0,
  medium: 2.5,
  high: 4,
  critical: 4,
};

/**
 * Mobile-first Economy HUD — 3 ระดับ:
 * 1) chip กะทัดรัดใต้ minimap
 * 2) toast / banner ชั่วคราว
 * 3) EconomyPanel เต็ม (เปิดเอง)
 */
export class EconomyMobileHUD {
  private readonly chip: HTMLDivElement;
  private readonly toast: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  private readonly economyBtn: HTMLButtonElement;
  private toastTimer = 0;
  private bannerTimer = 0;
  private currentToast: ClassifiedEconomyEvent | null = null;
  private currentBanner: ClassifiedEconomyEvent | null = null;
  private trendLabel = '';
  private lastLogTick = -1;
  private eventHistory: ClassifiedEconomyEvent[] = [];
  private panel: EconomyPanel | null = null;
  private onOpenPanel: (() => void) | null = null;

  constructor(private trade: TradeManager) {
    this.injectStyles();
    const minimapSize = isTouchDevice() ? 112 : 144;
    const topBase = 14 + minimapSize + 8;

    this.chip = document.createElement('div');
    this.chip.className = 'eco-chip';
    this.chip.style.top = `${topBase}px`;
    document.body.appendChild(this.chip);

    this.toast = document.createElement('div');
    this.toast.className = 'eco-toast';
    this.toast.style.top = `${topBase + 44}px`;
    document.body.appendChild(this.toast);

    this.banner = document.createElement('div');
    this.banner.className = 'eco-banner';
    document.body.appendChild(this.banner);

    this.economyBtn = document.createElement('button');
    this.economyBtn.type = 'button';
    this.economyBtn.className = 'eco-open-btn';
    this.economyBtn.textContent = '📈';
    this.economyBtn.title = 'เปิดตลาด & เศรษฐกิจ';
    this.economyBtn.addEventListener('click', () => this.onOpenPanel?.());
    document.body.appendChild(this.economyBtn);

    this.chip.addEventListener('click', () => this.onOpenPanel?.());
  }

  bindPanel(panel: EconomyPanel, onOpen: () => void): void {
    this.panel = panel;
    this.onOpenPanel = onOpen;
  }

  getEventHistory(): readonly ClassifiedEconomyEvent[] {
    return this.eventHistory;
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

    const displayable = classified
      .filter((e) => e.priority !== 'silent')
      .sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority));

    if (!displayable.length) return;

    const top = displayable[0];
    if (top.priority === 'critical') {
      this.showBanner(top);
    } else if (TOAST_DURATION[top.priority] > 0) {
      this.showToast(top);
    }
  }

  update(
    dt: number,
    opts: { shopOpen: boolean; panelOpen: boolean; islandId: IslandId },
  ): void {
    if (opts.shopOpen || opts.panelOpen) {
      this.hideTransient();
      this.chip.style.display = 'none';
      this.economyBtn.style.display = 'none';
      return;
    }
    this.economyBtn.style.display = '';

    this.ingestTick();
    this.updateTrend(opts.islandId);
    this.renderChip();

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.hideToast();
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.hideBanner();
    }
  }

  private updateTrend(islandId: IslandId): void {
    const arb = this.trade.living.bestArbitrageFrom(islandId);
    if (!arb) {
      this.trendLabel = '';
      return;
    }
    const name = TRADE_COMMODITIES.find((c) => c.id === arb.commodityId)?.nameTh ?? '';
    this.trendLabel = name ? `📈 ${name}` : '';
  }

  private renderChip(): void {
    const hold = this.trade.hold;
    const slots = cargoSlotsUsed(hold.slots);
    const coins = this.trade.walletCoins;
    const hint = this.currentToast?.message ?? this.trendLabel;
    this.chip.style.display = 'flex';
    this.chip.innerHTML = `
      <span class="eco-chip-coins">🪙 ${coins}</span>
      <span class="eco-chip-cargo">📦 ${slots}/${hold.maxSlots}</span>
      ${hint ? `<span class="eco-chip-hint">${hint}</span>` : ''}`;
  }

  private showToast(event: ClassifiedEconomyEvent): void {
    if (this.currentBanner) return;
    this.currentToast = event;
    this.toastTimer = TOAST_DURATION[event.priority];
    this.toast.textContent = event.message;
    this.toast.style.display = 'flex';
    this.toast.classList.add('eco-toast-visible');
  }

  private hideToast(): void {
    this.currentToast = null;
    this.toast.classList.remove('eco-toast-visible');
    this.toast.style.display = 'none';
  }

  private showBanner(event: ClassifiedEconomyEvent): void {
    this.hideToast();
    this.currentBanner = event;
    this.bannerTimer = TOAST_DURATION.critical;
    this.banner.textContent = `${event.icon} ${event.message}`;
    this.banner.style.display = 'block';
    this.banner.classList.add('eco-banner-visible');
  }

  private hideBanner(): void {
    this.currentBanner = null;
    this.banner.classList.remove('eco-banner-visible');
    this.banner.style.display = 'none';
  }

  private hideTransient(): void {
    this.hideToast();
    this.hideBanner();
  }

  private injectStyles(): void {
    if (document.getElementById('eco-mobile-hud-styles')) return;
    const style = document.createElement('style');
    style.id = 'eco-mobile-hud-styles';
    const minimapSize = isTouchDevice() ? 112 : 144;
    const chipTop = 14 + minimapSize + 8;
    const toastTop = chipTop + 44;
    style.textContent = `
      .eco-chip{position:fixed;z-index:20;left:14px;top:${chipTop}px;max-width:280px;height:36px;
        display:flex;align-items:center;gap:8px;padding:0 10px;box-sizing:border-box;
        background:rgba(6,28,32,.88);border:1px solid rgba(120,200,170,.35);border-radius:10px;
        color:#dff7ee;font:600 10px 'Segoe UI',Tahoma,sans-serif;cursor:pointer;
        pointer-events:auto;touch-action:manipulation;overflow:hidden}
      .eco-chip-coins{color:#ffe49a;white-space:nowrap}
      .eco-chip-cargo{color:#b8e8d4;white-space:nowrap}
      .eco-chip-hint{color:#9ec5bc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
      .eco-toast{position:fixed;z-index:30;left:14px;top:${toastTop}px;max-width:280px;height:36px;
        display:none;align-items:center;padding:0 10px;box-sizing:border-box;
        background:rgba(8,32,38,.92);border:1px solid rgba(140,220,190,.4);border-radius:10px;
        color:#e8f8f0;font:600 10px 'Segoe UI',Tahoma,sans-serif;pointer-events:none;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0;
        transition:opacity .25s ease}
      .eco-toast.eco-toast-visible{opacity:1}
      .eco-banner{position:fixed;z-index:30;left:50%;top:calc(12px + env(safe-area-inset-top,0px));
        transform:translateX(-50%);max-width:min(360px,92vw);display:none;
        padding:8px 14px;box-sizing:border-box;text-align:center;
        background:rgba(120,20,20,.88);border:1px solid rgba(255,140,120,.5);border-radius:12px;
        color:#fff;font:700 11px 'Segoe UI',Tahoma,sans-serif;pointer-events:none;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0;transition:opacity .2s}
      .eco-banner.eco-banner-visible{opacity:1}
      .eco-open-btn{position:fixed;z-index:20;left:${14 + minimapSize - 36}px;top:14px;
        width:34px;height:34px;border-radius:50%;border:1px solid rgba(120,200,170,.45);
        background:rgba(6,28,32,.9);color:#fff;font-size:16px;cursor:pointer;
        touch-action:manipulation;box-shadow:0 2px 8px rgba(0,0,0,.35)}
      .eco-open-btn:active{transform:scale(.94)}
      @media(min-width:701px){
        .eco-chip{max-width:320px;height:32px;font-size:11px}
        .eco-toast{max-width:320px}
        .eco-open-btn{left:${14 + 144 - 36}px}
      }
    `;
    document.head.appendChild(style);
  }
}

function priorityRank(p: EconomyEventPriority): number {
  return { silent: 0, low: 1, medium: 2, high: 3, critical: 4 }[p];
}
