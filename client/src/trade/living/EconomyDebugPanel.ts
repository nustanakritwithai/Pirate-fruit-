import type { LivingTradeSimulator } from './LivingTradeSimulator';
import { debugForcePause, debugForceReopen } from './FactoryAgent';
import { CELL_LABELS, LIVING_COMMODITY_IDS } from './LivingTradeConfig';
import { LIVING_COMMODITY_META } from './ProductionRecipes';
import type { LivingCommodityId } from './types';
import { ensurePlayerEconomy } from './PlayerEconomicProfileManager';
import { getOrCreateIslandReputation, resolveEconomicTitle } from './PlayerReputationManager';
import { generatePlayerContracts } from './PlayerContractGenerator';
import { completeContractWithWallet, failContractDebug } from './PlayerContractManager';
import { getGenome } from './EconomyGenomeInitializer';
import { getPressuresForCell } from './GenomePressureStore';
import { getEvolutionHistoryForCell } from './EvolutionHistory';

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
  private readonly traderGrid: HTMLDivElement;
  private readonly memoryGrid: HTMLDivElement;
  private readonly repGrid: HTMLDivElement;
  private readonly playerGrid: HTMLDivElement;
  private readonly genomeGrid: HTMLDivElement;
  private genomeCell: import('./types').EconomyCellId = 'leaf-island';
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
          <button type="button" data-action="force-success">Force Success</button>
          <button type="button" data-action="force-raid">Force Raid</button>
          <button type="button" data-action="add-mem">Add Profit Mem</button>
          <button type="button" data-action="clear-mem">Clear Trader Mem</button>
          <button type="button" data-action="reset-rep">Reset Reputation</button>
          <button type="button" data-action="tick50">+50 Tick</button>
        </div>
        <div class="eco-factory-title">Trader Profiles (E3)</div>
        <div class="eco-trader-grid"></div>
        <div class="eco-factory-title">Trader Memories</div>
        <div class="eco-memory-grid"></div>
        <div class="eco-factory-title">Route Reputation</div>
        <div class="eco-rep-grid"></div>
        <div class="eco-factory-title">Factory Agents</div>
        <div class="eco-factory-grid"></div>
        <div class="eco-orders-title">Trade Orders (E2)</div>
        <div class="eco-orders-grid"></div>
        <div class="eco-factory-title">Economy Genome (E4A)</div>
        <div class="eco-genome-cell-select">
          <label>Cell <select class="eco-genome-cell">
            <option value="leaf-island">Leaf</option>
            <option value="mine-island">Mine</option>
            <option value="cloth-island">Cloth</option>
            <option value="shipyard-island">Shipyard</option>
            <option value="frost-island">Frost</option>
            <option value="sky-island">Sky</option>
            <option value="volcano-island">Volcano</option>
          </select></label>
        </div>
        <div class="eco-genome-grid"></div>
        <div class="eco-actions eco-genome-actions">
          <button type="button" data-action="freeze-drift">Freeze Drift</button>
          <button type="button" data-action="freeze-all">Freeze Drift+Pressure</button>
          <button type="button" data-action="resume-genome">Resume Genome</button>
          <button type="button" data-action="accel-x10">Accel x10</button>
          <button type="button" data-action="accel-x100">Accel x100</button>
          <button type="button" data-action="add-factory-pressure">+Factory Pressure</button>
          <button type="button" data-action="add-trader-pressure">+Trader Pressure</button>
          <button type="button" data-action="add-player-pressure">+Player Pressure</button>
          <button type="button" data-action="add-market-pressure">+Market Pressure</button>
          <button type="button" data-action="wood-pos">+Wood Pressure</button>
          <button type="button" data-action="wood-neg">-Wood Pressure</button>
          <button type="button" data-action="eval-fitness">Eval Fitness</button>
          <button type="button" data-action="drift-now">Drift Now</button>
          <button type="button" data-action="identity-now">Identity Now</button>
          <button type="button" data-action="reset-genome">Reset Genome</button>
          <button type="button" data-action="clear-pressures">Clear Pressures</button>
          <button type="button" data-action="clear-evo">Clear Evo History</button>
        </div>
        <div class="eco-factory-title">Player Economy (E3.5)</div>
        <div class="eco-player-grid"></div>
        <div class="eco-actions eco-player-actions">
          <button type="button" data-action="force-trusted">Force Trusted</button>
          <button type="button" data-action="force-manipulator">Force Manipulator</button>
          <button type="button" data-action="force-savior">Force Savior</button>
          <button type="button" data-action="emergency-contract">Emergency Contract</button>
          <button type="button" data-action="complete-contract">Complete Contract</button>
          <button type="button" data-action="fail-contract">Fail Contract</button>
          <button type="button" data-action="reset-player-econ">Reset Player Econ</button>
        </div>
        <div class="eco-grid"></div>
        <div class="eco-log-title">เหตุการณ์ล่าสุด</div>
        <div class="eco-log"></div>
      </div>`;
    document.body.appendChild(this.root);
    this.grid = this.root.querySelector('.eco-grid')!;
    this.factoryGrid = this.root.querySelector('.eco-factory-grid')!;
    this.ordersGrid = this.root.querySelector('.eco-orders-grid')!;
    this.traderGrid = this.root.querySelector('.eco-trader-grid')!;
    this.memoryGrid = this.root.querySelector('.eco-memory-grid')!;
    this.repGrid = this.root.querySelector('.eco-rep-grid')!;
    this.playerGrid = this.root.querySelector('.eco-player-grid')!;
    this.genomeGrid = this.root.querySelector('.eco-genome-grid')!;
    this.logEl = this.root.querySelector('.eco-log')!;
    this.root.querySelector('.eco-genome-cell')!.addEventListener('change', (e) => {
      this.genomeCell = (e.target as HTMLSelectElement).value as import('./types').EconomyCellId;
      this.render();
    });
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
      if (action === 'force-success') this.sim.forceRouteSuccessDebug();
      if (action === 'force-raid') this.sim.forceRaidDebug();
      if (action === 'add-mem') this.sim.addProfitMemoryDebug('trader-leaf-safe', 'cloth-island', 'shipyard-island', 'rope', 80);
      if (action === 'clear-mem') this.sim.clearTraderMemoryDebug('trader-leaf-safe');
      if (action === 'reset-rep') this.sim.resetRouteReputationDebug();
      if (action === 'tick50') this.sim.tickMany50();
      if (action === 'force-trusted') {
        const pe = ensurePlayerEconomy(this.sim.state);
        const rep = getOrCreateIslandReputation(pe.profile, 'starter-island');
        rep.trust = 50;
        rep.marketManipulation = 5;
        rep.title = resolveEconomicTitle(rep, pe.profile);
      }
      if (action === 'force-manipulator') {
        const pe = ensurePlayerEconomy(this.sim.state);
        const rep = getOrCreateIslandReputation(pe.profile, 'starter-island');
        rep.marketManipulation = 70;
        rep.title = resolveEconomicTitle(rep, pe.profile);
      }
      if (action === 'force-savior') {
        const pe = ensurePlayerEconomy(this.sim.state);
        pe.profile.relievedCrisisCount = 6;
        const rep = getOrCreateIslandReputation(pe.profile, 'starter-island');
        rep.trust = 80;
        rep.title = resolveEconomicTitle(rep, pe.profile);
      }
      if (action === 'emergency-contract') {
        this.sim.injectShortage('shipyard-island', 'rope', 50);
        generatePlayerContracts(this.sim.state);
      }
      if (action === 'complete-contract') {
        const pe = ensurePlayerEconomy(this.sim.state);
        const c = pe.activeContracts[0];
        if (c) completeContractWithWallet(this.sim.state, c.id, { coins: 99999, spendCoins: () => true, addCoins: () => {} });
      }
      if (action === 'fail-contract') {
        const pe = ensurePlayerEconomy(this.sim.state);
        const c = pe.activeContracts[0];
        if (c) failContractDebug(this.sim.state, c.id);
      }
      if (action === 'reset-player-econ') {
        this.sim.resetPlayerEconomyDebug();
      }
      if (action === 'freeze-drift') this.sim.freezeGenomeDebug(false);
      if (action === 'freeze-all') this.sim.freezeGenomeDebug(true);
      if (action === 'resume-genome') this.sim.resumeGenomeDebug();
      if (action === 'accel-x10') this.sim.accelGenomeDebug(10);
      if (action === 'accel-x100') this.sim.accelGenomeDebug(100);
      if (action === 'add-factory-pressure') this.sim.addGenomePressureDebug(this.genomeCell, 'factory', 0.3, 'hardwood');
      if (action === 'add-trader-pressure') this.sim.addGenomePressureDebug(this.genomeCell, 'trader', 0.25);
      if (action === 'add-player-pressure') this.sim.addGenomePressureDebug(this.genomeCell, 'player', 0.2, 'fresh-fish');
      if (action === 'add-market-pressure') this.sim.addGenomePressureDebug(this.genomeCell, 'market', 0.15);
      if (action === 'wood-pos') this.sim.forceWoodPressureDebug(this.genomeCell, true);
      if (action === 'wood-neg') this.sim.forceWoodPressureDebug(this.genomeCell, false);
      if (action === 'eval-fitness') this.sim.evaluateFitnessDebug();
      if (action === 'drift-now') this.sim.driftGenomeDebug();
      if (action === 'identity-now') this.sim.resolveIdentityDebug();
      if (action === 'reset-genome') this.sim.resetGenomeDebug(this.genomeCell);
      if (action === 'clear-pressures') this.sim.clearPressuresDebug(this.genomeCell);
      if (action === 'clear-evo') this.sim.clearEvolutionHistoryDebug();
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
    this.root.querySelector('.eco-tick')!.textContent = `Tick: ${world.tick} · เรือ ${world.ships.length} · Orders ${world.orders.filter((o) => o.status === 'open' || o.status === 'assigned' || o.status === 'in-transit').length} · Mem ${world.traderRouteMemories?.length ?? 0}`;

    this.traderGrid.innerHTML = `<table class="eco-factory-table"><thead><tr>
      <th>Trader</th><th>personality</th><th>profit</th><th>ok/fail</th><th>explore</th>
    </tr></thead><tbody>${(world.traderProfiles ?? []).map((p) => `<tr>
      <td>${p.traderId.slice(-10)}</td><td>${p.personality}</td>
      <td>${Math.round(p.lifetimeProfit)}</td><td>${p.completedTrips}/${p.failedTrips}</td>
      <td>${p.explorationRate.toFixed(2)}</td></tr>`).join('')}</tbody></table>`;

    this.memoryGrid.innerHTML = `<table class="eco-factory-table"><thead><tr>
      <th>trader</th><th>route</th><th>profitEma</th><th>success</th><th>danger</th><th>conf</th><th>fail#</th>
    </tr></thead><tbody>${(world.traderRouteMemories ?? []).slice(-10).reverse().map((m) => `<tr>
      <td>${m.traderId.slice(-8)}</td>
      <td>${CELL_LABELS[m.sourceIslandId].slice(0,4)}→${CELL_LABELS[m.destinationIslandId].slice(0,4)} ${COMMODITY_LABELS[m.commodityId].slice(0,4)}</td>
      <td>${Math.round(m.profitEma)}</td><td>${m.successRateEma.toFixed(2)}</td>
      <td>${m.dangerEma.toFixed(2)}</td><td>${m.confidence.toFixed(2)}</td><td>${m.consecutiveFailures}</td>
    </tr>`).join('')}</tbody></table>`;

    this.repGrid.innerHTML = `<table class="eco-factory-table"><thead><tr>
      <th>route</th><th>ok/fail</th><th>profit</th><th>danger</th><th>cong</th><th>rep</th>
    </tr></thead><tbody>${(world.routeReputations ?? []).slice(0, 8).map((r) => `<tr>
      <td>${CELL_LABELS[r.sourceIslandId].slice(0,4)}→${CELL_LABELS[r.destinationIslandId].slice(0,4)}</td>
      <td>${r.successfulTrips}/${r.failedTrips}</td><td>${Math.round(r.averageProfit)}</td>
      <td>${r.dangerEma.toFixed(2)}</td><td>${r.congestionEma.toFixed(2)}</td><td>${r.reputationScore.toFixed(1)}</td>
    </tr>`).join('')}</tbody></table>`;

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

    const pe = world.playerEconomy;
    this.playerGrid.innerHTML = pe ? `<table class="eco-factory-table"><thead><tr>
      <th>profit</th><th>contracts</th><th>crises+</th><th>crises-</th><th>active</th><th>available</th><th>fee</th>
    </tr></thead><tbody><tr>
      <td>${Math.round(pe.profile.lifetimeProfit)}</td>
      <td>${pe.profile.completedContracts}/${pe.profile.failedContracts}</td>
      <td>${pe.profile.relievedCrisisCount}</td>
      <td>${pe.profile.causedMarketCrashCount}</td>
      <td>${pe.activeContracts.length}</td>
      <td>${pe.availableContracts.length}</td>
      <td>${(this.sim.getFeeModifierForIsland('starter-island') * 100).toFixed(1)}%</td>
    </tr></tbody></table>
    <div style="font-size:9px;margin-top:4px">Reps: ${Object.values(pe.profile.islandReputations).map((r) => `${r.islandId}:${r.title}`).join(', ') || 'none'}</div>` : 'no player economy';

    const genome = getGenome(world, this.genomeCell);
    const pressures = getPressuresForCell(world, this.genomeCell);
    const evo = getEvolutionHistoryForCell(world, this.genomeCell).slice(0, 5);
    const pressureTotals = ['factory', 'trader', 'player', 'market'].map((src) => {
      const sum = pressures.filter((p) => p.source === src).reduce((s, p) => s + Math.abs(p.strength), 0);
      return `${src}:${sum.toFixed(2)}`;
    }).join(' · ');
    this.genomeGrid.innerHTML = `
      <table class="eco-factory-table"><thead><tr>
        <th>stage</th><th>dominant</th><th>conf</th><th>gen</th><th>fitness</th><th>ind</th><th>trade</th><th>storage</th>
      </tr></thead><tbody><tr>
        <td>${genome.identity.economicStage}</td>
        <td>${genome.identity.dominantIndustry ?? '-'}</td>
        <td>${genome.identity.specializationConfidence.toFixed(2)}</td>
        <td>${genome.identity.genomeGeneration}</td>
        <td>${genome.fitness.emaScore.toFixed(2)}</td>
        <td>${genome.industrialization.toFixed(2)}</td>
        <td>${genome.tradePreference.toFixed(2)}</td>
        <td>${genome.storagePreference.toFixed(2)}</td>
      </tr></tbody></table>
      <div style="font-size:9px;margin:4px 0">Pressures (${pressures.length}): ${pressureTotals}</div>
      <div style="font-size:9px">hardwood bias ${(genome.productionBias.hardwood ?? 0.5).toFixed(3)} vel ${(genome.productionVelocity.hardwood ?? 0).toFixed(4)}</div>
      <div style="font-size:9px">freeze drift=${world.genomeState?.genomeDebug.freezeDrift} pressure=${world.genomeState?.genomeDebug.freezePressureCollection} accel=${world.genomeState?.genomeDebug.accelMultiplier}</div>
      <div style="font-size:9px;margin-top:4px">Evo: ${evo.map((e) => `D${e.day} ${e.type}`).join(' · ') || 'none'}</div>`;

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
