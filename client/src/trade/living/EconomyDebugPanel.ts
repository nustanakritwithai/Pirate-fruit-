import type { LivingTradeSimulator } from './LivingTradeSimulator';
import { debugForcePause, debugForceReopen } from './FactoryAgent';
import { CELL_LABELS, LIVING_COMMODITY_IDS } from './LivingTradeConfig';
import { LIVING_COMMODITY_META } from './ProductionRecipes';
import type { LivingCommodityId } from './types';

const COMMODITY_LABELS: Record<LivingCommodityId, string> = Object.fromEntries(
  LIVING_COMMODITY_IDS.map((id) => [id, LIVING_COMMODITY_META[id].label]),
) as Record<LivingCommodityId, string>;

const STATE_COLORS: Record<string, string> = {
  surplus: '#7fe0a3',
  balanced: '#9eb5c8',
  shortage: '#ffb86c',
  crisis: '#ff8e8e',
  collapsed: '#ff4d4d',
};

/**
 * แผง debug Economic CA — เปิดด้วย ?economy=1 หรือกด F8
 */
export class EconomyDebugPanel {
  private readonly root: HTMLDivElement;
  private readonly logEl: HTMLDivElement;
  private readonly grid: HTMLDivElement;
  private readonly factoryGrid: HTMLDivElement;
  private readonly ordersGrid: HTMLDivElement;
  private visible = false;

  constructor(private sim: LivingTradeSimulator) {
    this.injectStyles();
    this.root = document.createElement('div');
    this.root.className = 'eco-debug-root';
    this.root.innerHTML = `
      <div class="eco-debug">
        <div class="eco-debug-head">
          <h3>🌊 Economic Cellular Automata</h3>
          <span class="eco-tick">Tick: 0</span>
          <button type="button" class="eco-close">×</button>
        </div>
        <div class="eco-actions">
          <button type="button" data-action="tick1">+1 Tick</button>
          <button type="button" data-action="tick5">+5 Tick</button>
          <button type="button" data-action="tick10">+10 Tick</button>
          <button type="button" data-action="shortage">ขาดอาหารเหมือง</button>
          <button type="button" data-action="force-pause-yard">Pause อู่เรือ</button>
          <button type="button" data-action="force-reopen-yard">Reopen อู่เรือ</button>
          <button type="button" data-action="reset-factories">Reset Factories</button>
          <button type="button" data-action="shortage-rope">ขาดเชือกอู่เรือ</button>
          <button type="button" data-action="surplus-rope">เชือกล้นทอผ้า</button>
          <button type="button" data-action="gen-orders">Generate Orders</button>
          <button type="button" data-action="assign-order">Assign Best Order</button>
          <button type="button" data-action="fail-ship">Fail Shipment</button>
          <button type="button" data-action="complete-ship">Complete Shipment</button>
          <button type="button" data-action="clear-orders">Clear Orders</button>
        </div>
        <div class="eco-factory-title">Factory Agents</div>
        <div class="eco-factory-grid"></div>
        <div class="eco-orders-title">Trade Orders (E2)</div>
        <div class="eco-orders-grid"></div>
        <div class="eco-grid"></div>
        <div class="eco-log-title">เหตุการณ์ล่าสุด</div>
        <div class="eco-log"></div>
      </div>`;
    document.body.appendChild(this.root);
    this.grid = this.root.querySelector('.eco-grid')!;
    this.factoryGrid = this.root.querySelector('.eco-factory-grid')!;
    this.ordersGrid = this.root.querySelector('.eco-orders-grid')!;
    this.logEl = this.root.querySelector('.eco-log')!;
    this.root.querySelector('.eco-close')!.addEventListener('click', () => this.setVisible(false));
    this.root.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'tick1') this.sim.tick();
      if (action === 'tick5') this.sim.tickMany(5);
      if (action === 'tick10') this.sim.tickMany(10);
      if (action === 'shortage') this.sim.injectShortage('mine-island', 'fresh-fish', 40);
      if (action === 'force-pause-yard') {
        const f = this.sim.factories.find((x) => x.cellId === 'shipyard-island' && x.recipeId === 'sailcloth');
        const c = this.sim.getCell('shipyard-island');
        if (f && c) debugForcePause(f, c);
      }
      if (action === 'force-reopen-yard') {
        const f = this.sim.factories.find((x) => x.cellId === 'shipyard-island' && x.recipeId === 'sailcloth');
        const c = this.sim.getCell('shipyard-island');
        if (f && c) debugForceReopen(f, c);
      }
      if (action === 'reset-factories') this.sim.resetFactoryAgents();
      if (action === 'shortage-rope') this.sim.injectShortage('shipyard-island', 'rope', 30);
      if (action === 'surplus-rope') this.sim.injectSurplus('cloth-island', 'rope', 40);
      if (action === 'gen-orders') this.sim.generateOrdersDebug();
      if (action === 'assign-order') this.sim.assignBestOrderDebug();
      if (action === 'fail-ship') this.sim.failShipmentDebug();
      if (action === 'complete-ship') this.sim.completeShipmentDebug();
      if (action === 'clear-orders') this.sim.clearOrdersDebug();
      this.render();
    });
    if (new URLSearchParams(location.search).has('economy')) this.setVisible(true);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F8') {
        e.preventDefault();
        this.setVisible(!this.visible);
      }
    });
    this.root.style.display = 'none';
  }

  setVisible(show: boolean): void {
    this.visible = show;
    this.root.style.display = show ? 'flex' : 'none';
    if (show) this.render();
  }

  refresh(): void {
    if (this.visible) this.render();
  }

  private render(): void {
    const world = this.sim.state;
    this.root.querySelector('.eco-tick')!.textContent = `Tick: ${world.tick} · เรือ ${world.ships.length} · Orders ${world.orders.filter((o) => o.status === 'open' || o.status === 'assigned' || o.status === 'in-transit').length}`;

    this.ordersGrid.innerHTML = `<table class="eco-factory-table"><thead><tr>
      <th>สินค้า</th><th>ต้นทาง</th><th>ปลายทาง</th><th>จำนวน</th><th>urgency</th><th>กำไร</th><th>trader</th><th>สถานะ</th>
    </tr></thead><tbody>${world.orders.slice(-12).reverse().map((o) => `<tr>
      <td>${COMMODITY_LABELS[o.commodityId]}</td>
      <td>${CELL_LABELS[o.sourceIslandId]}</td>
      <td>${CELL_LABELS[o.destinationIslandId]}</td>
      <td>${o.remainingAmount}</td>
      <td>${o.urgency.toFixed(2)}</td>
      <td>${Math.round(o.expectedProfit)}</td>
      <td>${o.assignedTraderId?.slice(-8) ?? '-'}</td>
      <td>${o.status}</td>
    </tr>`).join('')}</tbody></table>`;

    this.factoryGrid.innerHTML = `<table class="eco-factory-table"><thead><tr>
      <th>เกาะ</th><th>สูตร</th><th>สถานะ</th><th>scale</th><th>กำไร</th><th>แรงงาน</th><th>+/-</th><th>cd</th><th>ตัดสินใจ</th>
    </tr></thead><tbody>${world.factories.map((f) => {
      const cell = world.cells.find((c) => c.id === f.cellId);
      return `<tr>
        <td>${cell?.nameTh ?? f.cellId}</td>
        <td>${f.activeRecipeId}</td>
        <td>${f.status}</td>
        <td>${f.outputScale.toFixed(2)}</td>
        <td>${Math.round(f.expectedUnitProfit)}</td>
        <td>${f.workforceAssigned}</td>
        <td>${f.profitableTicks}/${f.unprofitableTicks}</td>
        <td>${f.adaptationCooldown}</td>
        <td>${f.lastDecision}</td>
      </tr>`;
    }).join('')}</tbody></table>`;

    this.grid.innerHTML = world.cells.map((cell) => {
      const rows = LIVING_COMMODITY_IDS
        .filter((id) => cell.commodities[id])
        .map((id) => {
          const item = cell.commodities[id]!;
          const color = STATE_COLORS[item.marketState] ?? '#fff';
          const trend = item.trend === 'rising' ? '↑' : item.trend === 'falling' ? '↓' : '→';
          return `<tr>
            <td>${COMMODITY_LABELS[id]}</td>
            <td>${Math.floor(item.stock)}</td>
            <td>${item.currentPrice}</td>
            <td style="color:${color}">${item.marketState}</td>
            <td>${trend}</td>
          </tr>`;
        }).join('');
      return `<div class="eco-cell">
        <div class="eco-cell-name">${cell.nameTh}</div>
        <div class="eco-cell-meta">แรงงาน ${Math.round(cell.workforce * 100)}% · ขนส่ง ${cell.transportCapacity.toFixed(1)}</div>
        <table><thead><tr><th>สินค้า</th><th>สต็อก</th><th>ราคา</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table>
      </div>`;
    }).join('');

    this.logEl.innerHTML = world.log.slice(0, 12).map((e) =>
      `<div class="eco-log-line"><span class="eco-log-tick">T${e.tick}</span> ${e.message}</div>`,
    ).join('');
  }

  private injectStyles(): void {
    if (document.getElementById('eco-debug-styles')) return;
    const style = document.createElement('style');
    style.id = 'eco-debug-styles';
    style.textContent = `
      .eco-debug-root{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;
        background:rgba(2,8,16,.85);padding:10px;box-sizing:border-box}
      .eco-debug{width:min(920px,98vw);max-height:92vh;overflow:auto;background:#0a1a24;border:1px solid #3a7a6a;
        border-radius:12px;padding:12px;color:#dff7ee;font:500 11px 'Segoe UI',Tahoma,sans-serif}
      .eco-debug-head{display:flex;align-items:center;gap:10px;margin-bottom:8px}
      .eco-debug-head h3{margin:0;font-size:14px;color:#ffe08a;flex:1}
      .eco-tick{color:#8ff0c5;font-size:11px}
      .eco-close{background:0;border:0;color:#fff;font-size:20px;cursor:pointer}
      .eco-actions{display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap}
      .eco-actions button{padding:4px 10px;border-radius:6px;border:1px solid #4a8a7a;background:#123028;
        color:#dff7ee;cursor:pointer;font-size:10px;font-weight:700}
      .eco-actions button:hover{background:#1a4038}
      .eco-factory-title{margin:8px 0 4px;font-size:10px;color:#8eb5aa;text-transform:uppercase}
      .eco-factory-grid{overflow:auto;margin-bottom:8px;max-height:160px}
      .eco-factory-table{width:100%;border-collapse:collapse;font-size:9px}
      .eco-factory-table th{text-align:left;color:#7a9a90}
      .eco-factory-table td{padding:2px 4px;border-top:1px solid rgba(255,255,255,.06)}
      .eco-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px}
      .eco-cell{background:rgba(255,255,255,.04);border-radius:8px;padding:8px}
      .eco-cell-name{font-weight:700;color:#ffe9a8;margin-bottom:2px}
      .eco-cell-meta{font-size:9px;color:#8eb5aa;margin-bottom:4px}
      .eco-cell table{width:100%;border-collapse:collapse;font-size:9px}
      .eco-cell th{text-align:left;color:#7a9a90;font-weight:600}
      .eco-cell td{padding:2px 3px;border-top:1px solid rgba(255,255,255,.06)}
      .eco-log-title{margin-top:10px;font-size:10px;color:#8eb5aa;text-transform:uppercase}
      .eco-log{max-height:140px;overflow:auto;margin-top:4px;font-size:10px;line-height:1.45}
      .eco-log-tick{color:#6a9a8a;margin-right:4px}
    `;
    document.head.appendChild(style);
  }
}
