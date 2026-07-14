import type { IslandId } from '../island/IslandTypes';
import type { TradeManager } from '../trade/TradeManager';
import { TRADE_COMMODITIES } from '../trade/databook/commodities';
import { getMarketForIsland } from '../trade/TradeRegistry';
import { isLivingCommodity, resolveTradeCell, CELL_LABELS } from '../trade/living/LivingTradeConfig';
import { LIVING_COMMODITY_META, recipeForOutput } from '../trade/living/ProductionRecipes';
import { priceTrend } from '../trade/living/LivingTradeFormulas';
import type { ClassifiedEconomyEvent } from '../trade/living/EconomyEventClassifier';
import { titleLabel } from '../trade/living/PlayerEconomicProfileManager';
import { getPlayerEconomySummary } from '../trade/living/PlayerEconomyHistory';
import { getIsland } from '../island/IslandRegistry';

/**
 * Economy Panel — ข้อมูลเศรษฐกิจเต็ม (เปิดจากปุ่ม 📈)
 */
export class EconomyPanel {
  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly titleEl: HTMLHeadingElement;
  private visible = false;
  private viewMode: 'market' | 'alerts' | 'traders' | 'routes' | 'contracts' | 'reputation' | 'history' | 'records' = 'market';
  private islandId: IslandId = 'starter-island';
  private onCloseCallback: (() => void) | null = null;
  private eventHistory: ClassifiedEconomyEvent[] = [];
  private activeAlerts: ClassifiedEconomyEvent[] = [];

  constructor(
    private trade: TradeManager,
    private getIslandId: () => IslandId,
  ) {
    this.injectStyles();
    this.root = document.createElement('div');
    this.root.className = 'economy-panel-root';
    this.root.innerHTML = `
      <div class="economy-panel">
        <div class="economy-panel-head">
          <h2>📈 ตลาด & เศรษฐกิจ</h2>
          <button type="button" class="economy-panel-close" aria-label="ปิด">×</button>
        </div>
        <div class="economy-panel-body"></div>
      </div>`;
    document.body.appendChild(this.root);
    this.body = this.root.querySelector('.economy-panel-body')!;
    this.titleEl = this.root.querySelector('h2')!;
    this.root.querySelector('.economy-panel-close')!
      .addEventListener('click', () => this.close());
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });
    this.root.style.display = 'none';
  }

  get isOpen(): boolean {
    return this.visible;
  }

  setEventHistory(events: readonly ClassifiedEconomyEvent[]): void {
    this.eventHistory = [...events];
    if (this.visible) this.render();
  }

  setActiveAlerts(alerts: readonly ClassifiedEconomyEvent[]): void {
    this.activeAlerts = [...alerts];
    if (this.visible && this.viewMode === 'alerts') this.render();
  }

  open(onClose?: () => void): void {
    this.viewMode = 'market';
    this.show(onClose);
  }

  openAlerts(onClose?: () => void): void {
    this.viewMode = 'alerts';
    this.show(onClose);
  }

  private show(onClose?: () => void): void {
    if (document.pointerLockElement) document.exitPointerLock();
    this.onCloseCallback = onClose ?? null;
    this.visible = true;
    this.islandId = this.getIslandId();
    this.root.style.display = 'flex';
    this.render();
  }

  close(): void {
    if (!this.visible) return;
    this.visible = false;
    this.viewMode = 'market';
    this.root.style.display = 'none';
    const cb = this.onCloseCallback;
    this.onCloseCallback = null;
    cb?.();
  }

  refresh(): void {
    if (this.visible) {
      this.islandId = this.getIslandId();
      this.render();
    }
  }

  private render(): void {
    if (this.viewMode === 'alerts') {
      this.titleEl.textContent = '⚠️ แจ้งเตือนเศรษฐกิจ';
      const alertsHtml = this.activeAlerts.length
        ? [...this.activeAlerts.values()].map((a) => `
            <div class="ep-alert-item ep-pri-${a.priority}">
              <div class="ep-alert-short">${a.icon} ${a.message}</div>
              <div class="ep-alert-full">${a.fullMessage}</div>
            </div>`).join('')
        : '<div class="ep-log">ไม่มีแจ้งเตือนที่ต้องติดตาม</div>';
      this.body.innerHTML = `
        <div class="ep-alert-list">${alertsHtml}</div>
        <button type="button" class="ep-tab-market">📈 ดูตลาดทั้งหมด</button>`;
      this.body.querySelector('.ep-tab-market')
        ?.addEventListener('click', () => {
          this.viewMode = 'market';
          this.render();
        });
      return;
    }

    if (this.viewMode === 'traders') {
      this.titleEl.textContent = '🧭 พ่อค้า & ความจำ';
      const world = this.trade.living.state;
      const profiles = world.traderProfiles ?? [];
      const memories = world.traderRouteMemories ?? [];
      const traderRows = profiles.map((p) => {
        const trader = world.traders.find((t) => t.id === p.traderId);
        const order = trader?.activeOrderId
          ? world.orders.find((o) => o.id === trader.activeOrderId)
          : null;
        return `<tr>
          <td>${trader?.nameTh ?? p.traderId}</td>
          <td>${p.personality}</td>
          <td>${order ? LIVING_COMMODITY_META[order.commodityId].label : '-'}</td>
          <td>${Math.round(p.lifetimeProfit)}</td>
          <td>${p.completedTrips}/${p.failedTrips}</td>
          <td>${p.preferredCommodities.map((c) => LIVING_COMMODITY_META[c].label.slice(0, 4)).join(', ') || '-'}</td>
        </tr>`;
      }).join('');
      const memRows = memories.slice(-15).reverse().map((m) => `<tr>
        <td>${m.traderId.split('-').slice(-2).join('-')}</td>
        <td>${CELL_LABELS[m.sourceIslandId].slice(0, 5)}→${CELL_LABELS[m.destinationIslandId].slice(0, 5)}</td>
        <td>${LIVING_COMMODITY_META[m.commodityId].label}</td>
        <td>${Math.round(m.profitEma)}</td>
        <td>${(m.successRateEma * 100).toFixed(0)}%</td>
        <td>${m.confidence.toFixed(2)}</td>
        <td>${m.consecutiveFailures > 0 ? 'หลีกเลี่ยง' : m.profitEma > 20 ? 'ชอบ' : 'กลาง'}</td>
      </tr>`).join('');
      this.body.innerHTML = `
        <table class="ep-table"><thead><tr>
          <th>พ่อค้า</th><th>บุคลิก</th><th>งานปัจจุบัน</th><th>กำไรรวม</th><th>สำเร็จ/ล้ม</th><th>ถนัด</th>
        </tr></thead><tbody>${traderRows || '<tr><td colspan="6">ไม่มีข้อมูล</td></tr>'}</tbody></table>
        <div class="ep-section-title">ความจำเส้นทาง</div>
        <table class="ep-table"><thead><tr>
          <th>พ่อค้า</th><th>เส้นทาง</th><th>สินค้า</th><th>กำไร EMA</th><th>สำเร็จ</th><th>conf</th><th>สถานะ</th>
        </tr></thead><tbody>${memRows || '<tr><td colspan="7">ยังไม่มีความจำ</td></tr>'}</tbody></table>
        <button type="button" class="ep-tab-market">📈 ตลาด</button>`;
      this.body.querySelector('.ep-tab-market')?.addEventListener('click', () => {
        this.viewMode = 'market';
        this.render();
      });
      return;
    }

    if (this.viewMode === 'contracts') {
      this.titleEl.textContent = '📦 สัญญาขนส่ง';
      const pe = this.trade.playerEconomy;
      const rows = [...pe.availableContracts, ...pe.activeContracts].map((c) => `
        <tr>
          <td>${LIVING_COMMODITY_META[c.commodityId].label}</td>
          <td>${CELL_LABELS[c.sourceIslandId]}</td>
          <td>${CELL_LABELS[c.destinationIslandId]}</td>
          <td>${c.deliveredAmount}/${c.requestedAmount}</td>
          <td>${c.completionReward}</td>
          <td>${c.collateral}</td>
          <td>${c.expiresAtTick - this.trade.living.state.tick}</td>
          <td>${c.status}</td>
          <td>${c.status === 'available' ? `<button data-accept="${c.id}">รับ</button>` : ''}
              ${c.status === 'accepted' || c.status === 'in-progress' ? `<button data-abandon="${c.id}">ยกเลิก</button>` : ''}
              <button data-track="${c.id}">ติดตาม</button></td>
        </tr>`).join('');
      this.body.innerHTML = `
        <table class="ep-table"><thead><tr>
          <th>สินค้า</th><th>ต้นทาง</th><th>ปลายทาง</th><th>ส่ง</th><th>รางวัล</th><th>หลักประกัน</th><th>เหลือ tick</th><th>สถานะ</th><th></th>
        </tr></thead><tbody>${rows || '<tr><td colspan="9">ไม่มีสัญญา</td></tr>'}</tbody></table>
        <button type="button" class="ep-tab-market">📈 ตลาด</button>`;
      this.body.querySelectorAll('[data-accept]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.trade.acceptContract((btn as HTMLElement).dataset.accept!);
          this.render();
        });
      });
      this.body.querySelectorAll('[data-abandon]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.trade.abandonContract((btn as HTMLElement).dataset.abandon!);
          this.render();
        });
      });
      this.body.querySelectorAll('[data-track]').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.trade.trackContract((btn as HTMLElement).dataset.track!);
        });
      });
      this.body.querySelector('.ep-tab-market')?.addEventListener('click', () => {
        this.viewMode = 'market';
        this.render();
      });
      return;
    }

    if (this.viewMode === 'reputation') {
      this.titleEl.textContent = '⭐ ชื่อเสียงเศรษฐกิจ';
      const reps = Object.values(this.trade.playerEconomy.profile.islandReputations);
      const rows = reps.map((r) => `
        <tr>
          <td>${getIsland(r.islandId).name}</td>
          <td>${titleLabel(r.title)}</td>
          <td>${Math.round(r.trust)}</td>
          <td>${Math.round(r.supplierReputation)}</td>
          <td>${Math.round(r.marketManipulation)}</td>
          <td>${Math.round(r.contractReliability)}</td>
          <td>${Math.round(r.crisisContribution)}</td>
        </tr>`).join('');
      const fee = Math.round(this.trade.living.getFeeModifierForIsland(this.islandId) * 1000) / 10;
      this.body.innerHTML = `
        <div class="ep-summary">ค่าธรรมเนียมขายเกาะนี้: ${fee}%</div>
        <table class="ep-table"><thead><tr>
          <th>เกาะ</th><th>ฉายา</th><th>trust</th><th>supplier</th><th>manipulation</th><th>reliability</th><th>crisis</th>
        </tr></thead><tbody>${rows || '<tr><td colspan="7">ยังไม่มีชื่อเสียง</td></tr>'}</tbody></table>
        <button type="button" class="ep-tab-market">📈 ตลาด</button>`;
      this.body.querySelector('.ep-tab-market')?.addEventListener('click', () => {
        this.viewMode = 'market';
        this.render();
      });
      return;
    }

    if (this.viewMode === 'history') {
      this.titleEl.textContent = '📜 ประวัติการค้า';
      const rows = this.trade.playerEconomy.tradeHistory.slice(0, 30).map((h) => `
        <tr>
          <td>T${h.tick}</td>
          <td>${h.type === 'buy' ? 'ซื้อ' : 'ขาย'}</td>
          <td>${LIVING_COMMODITY_META[h.commodityId].label}</td>
          <td>${h.amount}</td>
          <td>${h.totalValue}</td>
          <td>${h.impact}</td>
          <td>${h.marketStateBefore}→${h.marketStateAfter}</td>
        </tr>`).join('');
      this.body.innerHTML = `
        <table class="ep-table"><thead><tr>
          <th>Tick</th><th>ประเภท</th><th>สินค้า</th><th>จำนวน</th><th>มูลค่า</th><th>ผลกระทบ</th><th>ตลาด</th>
        </tr></thead><tbody>${rows || '<tr><td colspan="7">ยังไม่มีประวัติ</td></tr>'}</tbody></table>
        <button type="button" class="ep-tab-market">📈 ตลาด</button>`;
      this.body.querySelector('.ep-tab-market')?.addEventListener('click', () => {
        this.viewMode = 'market';
        this.render();
      });
      return;
    }

    if (this.viewMode === 'records') {
      this.titleEl.textContent = '🏆 สถิติโลก';
      const summary = getPlayerEconomySummary(this.trade.living.state);
      const rec = this.trade.playerEconomy.worldRecords;
      const fmt = (r: typeof rec.biggestSupplier) => r ? `${r.entityName}: ${Math.round(r.value)}` : '-';
      this.body.innerHTML = `
        <div class="ep-summary">
          <span>กำไรรวม ${Math.round(summary.lifetimeProfit)}</span>
          <span>สัญญาสำเร็จ ${(summary.contractSuccessRate * 100).toFixed(0)}%</span>
          <span>ช่วยวิกฤต ${summary.crisesRelieved}</span>
          <span>สร้างวิกฤต ${summary.crisesCaused}</span>
        </div>
        <div class="ep-factory-list">
          <div class="ep-factory-row">ผู้จัดหาสูงสุด: ${fmt(rec.biggestSupplier)}</div>
          <div class="ep-factory-row">นำเข้ามากสุด: ${fmt(rec.largestImporter)}</div>
          <div class="ep-factory-row">กำไรเดียวสูงสุด: ${fmt(rec.highestSingleTradeProfit)}</div>
          <div class="ep-factory-row">ไว้ใจที่สุด: ${fmt(rec.mostTrustedMerchant)}</div>
          <div class="ep-factory-row">บิดเบือนตลาด: ${fmt(rec.biggestMarketManipulator)}</div>
          <div class="ep-factory-row">ช่วยขาดแคลน: ${fmt(rec.mostRelievedCommodity)}</div>
        </div>
        <button type="button" class="ep-tab-market">📈 ตลาด</button>`;
      this.body.querySelector('.ep-tab-market')?.addEventListener('click', () => {
        this.viewMode = 'market';
        this.render();
      });
      return;
    }

    if (this.viewMode === 'routes') {
      this.titleEl.textContent = '🗺️ เส้นทาง & ชื่อเสียง';
      const world = this.trade.living.state;
      const reps = (world.routeReputations ?? []).slice(0, 20);
      const repRows = reps.map((r) => `<tr>
        <td>${CELL_LABELS[r.sourceIslandId]}→${CELL_LABELS[r.destinationIslandId]}</td>
        <td>${LIVING_COMMODITY_META[r.commodityId].label}</td>
        <td>${r.successfulTrips}/${r.failedTrips}</td>
        <td>${r.raidCount}</td>
        <td>${Math.round(r.averageProfit)}</td>
        <td>${r.congestionEma.toFixed(2)}</td>
        <td>${r.reputationScore.toFixed(1)}</td>
      </tr>`).join('');
      this.body.innerHTML = `
        <table class="ep-table"><thead><tr>
          <th>เส้นทาง</th><th>สินค้า</th><th>สำเร็จ/ล้ม</th><th>ปล้น</th><th>กำไรเฉลี่ย</th><th>แออัด</th><th>ชื่อเสียง</th>
        </tr></thead><tbody>${repRows || '<tr><td colspan="7">ไม่มีข้อมูล</td></tr>'}</tbody></table>
        <button type="button" class="ep-tab-market">📈 ตลาด</button>`;
      this.body.querySelector('.ep-tab-market')?.addEventListener('click', () => {
        this.viewMode = 'market';
        this.render();
      });
      return;
    }

    this.titleEl.textContent = '📈 ตลาด & เศรษฐกิจ';
    const market = getMarketForIsland(this.islandId);
    const arb = this.trade.living.bestArbitrageFrom(this.islandId);
    const hold = this.trade.hold;

    const marketRows = (market?.entries ?? []).map((entry) => {
      const commodity = TRADE_COMMODITIES.find((c) => c.id === entry.commodityId);
      if (!commodity || !isLivingCommodity(commodity.id)) return '';
      const item = this.trade.living.getCommodityAtGameIsland(this.islandId, commodity.id);
      if (!item) return '';
      const trend = priceTrend(item);
      const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
      const buy = this.trade.resolveBuyPrice(this.islandId, commodity.id, 1) ?? 0;
      const sell = this.trade.resolveSellPrice(this.islandId, commodity.id, 1) ?? 0;
      const recipe = recipeForOutput(commodity.id);
      const recipeHtml = recipe
        ? `<div class="ep-recipe">ผลิต: ${Object.entries(recipe.inputs)
          .map(([id, n]) => `${LIVING_COMMODITY_META[id as keyof typeof LIVING_COMMODITY_META].label}×${n}`)
          .join(' + ')} → ${recipe.outputAmount}</div>`
        : '';
      return `<tr>
        <td>${commodity.icon} ${commodity.nameTh}</td>
        <td>${Math.floor(item.stock)}</td>
        <td>${item.production.toFixed(1)}</td>
        <td>${item.consumption.toFixed(1)}</td>
        <td>${buy}/${sell}</td>
        <td class="ep-trend-${trend}">${trendIcon}</td>
        <td><span class="ep-state ep-state-${item.marketState}">${item.marketState}</span></td>
      </tr>${recipeHtml ? `<tr class="ep-recipe-row"><td colspan="7">${recipeHtml}</td></tr>` : ''}`;
    }).join('');

    const cellId = market ? resolveTradeCell(this.islandId, 'fresh-fish') : null;
    const factoryStatus = cellId
      ? this.trade.living.getFactoryStatus(cellId)
      : null;

    const cellFactories = cellId
      ? this.trade.living.factories.filter((f) => f.cellId === cellId)
      : [];
    const factoryRows = cellFactories.map((f) => `
      <div class="ep-factory-row">
        <b>${LIVING_COMMODITY_META[f.activeRecipeId].label}</b>
        สถานะ: ${f.status} · กำลังผลิต ${Math.round(f.outputScale * 100)}%
        · กำไรคาดการณ์ ${Math.round(f.expectedUnitProfit)} Beli/รอบ
        · แรงงาน ${f.workforceAssigned}
        ${f.lastReasons.length ? `<div class="ep-factory-reasons">สาเหตุ: ${f.lastReasons.join(', ')}</div>` : ''}
      </div>`).join('');

    const arbHtml = arb
      ? `<div class="ep-arb">⚓ ซื้อ <b>${TRADE_COMMODITIES.find((c) => c.id === arb.commodityId)?.nameTh}</b>
         → ขายที่ <b>${getIsland(arb.toIslandId).name}</b> (~${arb.profit} Beli)</div>`
      : '';

    const historyHtml = this.eventHistory.slice(0, 20).map((e) =>
      `<div class="ep-log ep-pri-${e.priority}">${e.icon} ${e.fullMessage}</div>`,
    ).join('');

    const openOrders = this.trade.living.state.orders.filter(
      (o) => o.status === 'open' || o.status === 'assigned' || o.status === 'in-transit',
    );
    const orderRows = openOrders.map((o) => `<tr>
      <td>${LIVING_COMMODITY_META[o.commodityId].label}</td>
      <td>${CELL_LABELS[o.sourceIslandId]}</td>
      <td>${CELL_LABELS[o.destinationIslandId]}</td>
      <td>${o.remainingAmount}</td>
      <td>${o.urgency.toFixed(2)}</td>
      <td>${Math.round(o.expectedProfit)}</td>
      <td>${o.assignedTraderId ? o.assignedTraderId.split('-').slice(-2).join('-') : '-'}</td>
      <td>${o.status}</td>
    </tr>`).join('');

    this.body.innerHTML = `
      <div class="ep-summary">
        <span>🪙 ${this.trade.walletCoins} Beli</span>
        <span>📦 Cargo ${hold.slots.reduce((s, x) => s + x.quantity, 0)} ชิ้น</span>
        ${factoryStatus ? `<span class="ep-warn">🏭 ${factoryStatus}</span>` : ''}
      </div>
      ${arbHtml}
      ${factoryRows ? `<div class="ep-section-title">โรงงาน</div><div class="ep-factory-list">${factoryRows}</div>` : ''}
      <div class="ep-section-title">คำสั่งขนส่ง (Trade Orders)</div>
      <table class="ep-table">
        <thead><tr>
          <th>สินค้า</th><th>ต้นทาง</th><th>ปลายทาง</th><th>จำนวน</th><th>เร่งด่วน</th><th>กำไร≈</th><th>พ่อค้า</th><th>สถานะ</th>
        </tr></thead>
        <tbody>${orderRows || '<tr><td colspan="8">ไม่มีคำสั่งเปิดอยู่</td></tr>'}</tbody>
      </table>
      <div class="ep-section-title">ตลาดเกาะปัจจุบัน</div>
      <table class="ep-table">
        <thead><tr>
          <th>สินค้า</th><th>สต็อก</th><th>ผลิต</th><th>บริโภค</th><th>ซื้อ/ขาย</th><th></th><th>สถานะ</th>
        </tr></thead>
        <tbody>${marketRows || '<tr><td colspan="7">ไม่มีข้อมูล</td></tr>'}</tbody>
      </table>
      <div class="ep-section-title">เหตุการณ์เศรษฐกิจ</div>
      <div class="ep-log-list">${historyHtml || '<div class="ep-log">ยังไม่มีเหตุการณ์</div>'}</div>
      <div class="ep-tabs">
        <button type="button" class="ep-tab-contracts">📦 สัญญา</button>
        <button type="button" class="ep-tab-reputation">⭐ ชื่อเสียง</button>
        <button type="button" class="ep-tab-history">📜 ประวัติ</button>
        <button type="button" class="ep-tab-records">🏆 สถิติ</button>
        <button type="button" class="ep-tab-traders">🧭 พ่อค้า</button>
        <button type="button" class="ep-tab-routes">🗺️ เส้นทาง</button>
      </div>`;
    this.body.querySelector('.ep-tab-contracts')?.addEventListener('click', () => {
      this.viewMode = 'contracts';
      this.render();
    });
    this.body.querySelector('.ep-tab-reputation')?.addEventListener('click', () => {
      this.viewMode = 'reputation';
      this.render();
    });
    this.body.querySelector('.ep-tab-history')?.addEventListener('click', () => {
      this.viewMode = 'history';
      this.render();
    });
    this.body.querySelector('.ep-tab-records')?.addEventListener('click', () => {
      this.viewMode = 'records';
      this.render();
    });
    this.body.querySelector('.ep-tab-traders')?.addEventListener('click', () => {
      this.viewMode = 'traders';
      this.render();
    });
    this.body.querySelector('.ep-tab-routes')?.addEventListener('click', () => {
      this.viewMode = 'routes';
      this.render();
    });
  }

  private injectStyles(): void {
    if (document.getElementById('economy-panel-styles')) return;
    const style = document.createElement('style');
    style.id = 'economy-panel-styles';
    style.textContent = `
      .economy-panel-root{position:fixed;inset:0;z-index:100;display:flex;align-items:center;
        justify-content:center;background:rgba(2,8,16,.82);padding:12px;box-sizing:border-box}
      .economy-panel{width:min(560px,96vw);max-height:88vh;overflow:auto;
        background:linear-gradient(165deg,#0a2430,#061820);border:1px solid rgba(120,210,180,.35);
        border-radius:14px;padding:14px 16px;color:#e8f4f2;
        font:600 11px 'Segoe UI',Tahoma,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.45)}
      .economy-panel-head{display:flex;align-items:center;margin-bottom:10px}
      .economy-panel-head h2{margin:0;flex:1;font-size:16px;color:#ffe9a8}
      .economy-panel-close{background:0;border:0;color:#fff;font-size:24px;cursor:pointer;line-height:1}
      .ep-summary{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:8px;color:#cfe6ea;font-size:11px}
      .ep-warn{color:#ffb86c}
      .ep-arb{margin-bottom:10px;padding:8px 10px;border-radius:8px;background:rgba(255,220,120,.08);
        color:#d8f2ea;line-height:1.45}
      .ep-section-title{margin:10px 0 6px;font-size:10px;color:#8eb5aa;text-transform:uppercase}
      .ep-table{width:100%;border-collapse:collapse;font-size:10px}
      .ep-table th{text-align:left;color:#7a9a90;font-weight:600;padding:3px 4px}
      .ep-table td{padding:4px;border-top:1px solid rgba(255,255,255,.07);vertical-align:top}
      .ep-trend-up{color:#ff9b8e}.ep-trend-down{color:#8ff0c5}.ep-trend-flat{color:#9eb5c8}
      .ep-state{font-size:8px;padding:1px 4px;border-radius:4px;text-transform:uppercase}
      .ep-state-surplus{background:rgba(127,224,163,.2);color:#7fe0a3}
      .ep-state-balanced{background:rgba(158,181,200,.15);color:#9eb5c8}
      .ep-state-shortage{background:rgba(255,184,108,.2);color:#ffb86c}
      .ep-state-crisis,.ep-state-collapsed{background:rgba(255,142,142,.2);color:#ff8e8e}
      .ep-recipe-row td{font-size:9px;color:#8eb5aa;padding-top:0}
      .ep-recipe{font-size:9px}
      .ep-log-list{max-height:140px;overflow:auto}
      .ep-log{padding:4px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:10px;line-height:1.4}
      .ep-pri-critical{color:#ff8e8e}.ep-pri-high{color:#ffb86c}.ep-pri-medium{color:#b8e8d4}
      .ep-pri-low,.ep-pri-silent{color:#8eb5aa}
      .ep-alert-list{max-height:min(360px,55vh);overflow:auto;margin-bottom:10px}
      .ep-alert-item{padding:8px 10px;margin-bottom:6px;border-radius:8px;
        background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)}
      .ep-alert-short{font-size:11px;color:#e8f4f2;margin-bottom:4px}
      .ep-alert-full{font-size:10px;color:#8eb5aa;line-height:1.45}
      .ep-tab-market{width:100%;border:1px solid rgba(120,210,180,.35);border-radius:10px;
        padding:8px;background:rgba(255,220,120,.08);color:#ffe9a8;font:inherit;cursor:pointer}
      .ep-factory-list{margin-bottom:8px}
      .ep-factory-row{padding:6px 8px;margin-bottom:4px;border-radius:8px;background:rgba(255,255,255,.04);
        font-size:10px;line-height:1.45}
      .ep-factory-reasons{color:#8eb5aa;font-size:9px;margin-top:2px}
      .ep-tabs{display:flex;gap:8px;margin-top:12px}
      .ep-tabs button{flex:1;padding:8px;border-radius:8px;border:1px solid #4a8a7a;background:#123028;color:#dff7ee;cursor:pointer;font-size:10px}
      @media(max-width:700px){.economy-panel-root{align-items:flex-end;padding:8px}
        .economy-panel{max-height:82vh;border-radius:14px 14px 0 0}}
    `;
    document.head.appendChild(style);
  }
}
