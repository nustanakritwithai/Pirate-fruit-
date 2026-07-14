import * as THREE from 'three';
import { EconomyDebugPanel } from '../../trade/living/EconomyDebugPanel';
import { MonsterCellularDebugPanel } from '../../monster/cellular/MonsterCellularDebugPanel';
import { DevilFruitInfluenceDebugPanel } from '../../devilfruit/influence/DevilFruitInfluenceDebugPanel';
import { resolveEmergentRole } from '../../monster/cellular/CombatExperienceAdapter';
import { DEVIL_FRUIT_EFFECT_TYPES } from '../../devilfruit/influence/DevilFruitInfluenceTypes';
import { SimulationController } from './SimulationController';
import { SimulationEventBus } from './SimulationEventBus';
import { SimulationTimeMachine, formatTimeLabel } from './SimulationTimeMachine';
import { loadInspectorState, saveInspectorState, resetInspectorState } from './SimulationPersistence';
import { InfluenceVisualizer } from './InfluenceVisualizer';
import {
  buildLiveCellDetails,
  renderLiveCellHtml,
  type LiveCellSelection,
} from './LiveCellInspector';
import { HEATMAP_LABELS, heatmapModesList } from './HeatmapModes';
import {
  INSPECTOR_TABS,
  TAB_LABELS,
  type SimulationInspectorDeps,
  type SimulationInspectorTab,
  type SimulationSnapshot,
  type HeatmapMode,
  type SimulationEventCategory,
} from './SimulationInspectorTypes';

export interface SimulationInspectorHandle {
  controller: SimulationController;
  eventBus: SimulationEventBus;
  timeMachine: SimulationTimeMachine;
  influenceVisualizer: InfluenceVisualizer;
  setVisible(show: boolean): void;
  refresh(): void;
  update(dt: number): void;
  recordEconomyTick(ms: number): void;
  recordMonsterTick(ms: number): void;
  recordDevilFruitTick(ms: number): void;
  recordRender(ms: number): void;
  dispose(): void;
}

interface PerfStats {
  economyTickMs: number;
  monsterTickMs: number;
  devilFruitTickMs: number;
  renderMs: number;
  neighborQueries: number;
  spatialQueries: number;
  activeCells: number;
}

export function createSimulationInspector(deps: SimulationInspectorDeps): SimulationInspectorHandle {
  const controller = new SimulationController();
  const eventBus = new SimulationEventBus();
  const timeMachine = new SimulationTimeMachine(60, 1000);
  const influenceVisualizer = new InfluenceVisualizer(
    deps.game.scene,
    deps.cellularWorld,
    deps.devilFruitInfluence,
  );

  const persisted = loadInspectorState();
  let visible = new URLSearchParams(location.search).has('sim');
  let activeTab: SimulationInspectorTab = persisted.activeTab;
  let heatmap: HeatmapMode = persisted.heatmap;
  let selectMode = persisted.selectMode;
  let selectedCell: LiveCellSelection | null = null;
  let timelineFilter: SimulationEventCategory | 'all' = 'all';
  const perf: PerfStats = {
    economyTickMs: 0,
    monsterTickMs: 0,
    devilFruitTickMs: 0,
    renderMs: 0,
    neighborQueries: 0,
    spatialQueries: 0,
    activeCells: 0,
  };

  injectStyles();
  const root = document.createElement('div');
  root.className = 'si-root';
  root.style.display = visible ? 'flex' : 'none';
  document.body.appendChild(root);

  const windowEl = document.createElement('div');
  windowEl.className = 'si-window';
  applyWindowGeometry(windowEl, persisted);
  root.appendChild(windowEl);

  const header = document.createElement('div');
  header.className = 'si-header';
  header.innerHTML = `
    <span class="si-title">Simulation Inspector</span>
    <button type="button" class="si-collapse" title="Collapse">▾</button>
    <button type="button" class="si-close" title="Close (F12)">×</button>`;
  windowEl.appendChild(header);

  const tabsEl = document.createElement('div');
  tabsEl.className = 'si-tabs';
  windowEl.appendChild(tabsEl);

  const body = document.createElement('div');
  body.className = 'si-body';
  windowEl.appendChild(body);

  const tabPanels = new Map<SimulationInspectorTab, HTMLDivElement>();
  for (const tab of INSPECTOR_TABS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `si-tab${tab === activeTab ? ' active' : ''}`;
    btn.dataset.tab = tab;
    btn.textContent = TAB_LABELS[tab];
    tabsEl.appendChild(btn);

    const panel = document.createElement('div');
    panel.className = `si-panel${tab === activeTab ? ' active' : ''}`;
    panel.dataset.panel = tab;
    body.appendChild(panel);
    tabPanels.set(tab, panel);
  }

  const economyMount = tabPanels.get('economy')!;
  const monsterMount = tabPanels.get('monster')!;
  const devilMount = tabPanels.get('devilfruit')!;

  const economyPanel = new EconomyDebugPanel(deps.living, { embedded: true, mountParent: economyMount });
  const monsterPanel = new MonsterCellularDebugPanel(deps.cellularWorld, { embedded: true, mountParent: monsterMount });
  const devilPanel = new DevilFruitInfluenceDebugPanel(deps.devilFruitInfluence, {
    embedded: true,
    mountParent: devilMount,
  });

  const overviewEl = document.createElement('div');
  overviewEl.className = 'si-overview';
  tabPanels.get('overview')!.appendChild(overviewEl);

  const combatEl = document.createElement('div');
  combatEl.className = 'si-combat';
  tabPanels.get('combat')!.appendChild(combatEl);

  const worldEl = document.createElement('div');
  worldEl.className = 'si-world';
  worldEl.innerHTML = `
    <div class="si-world-filters">
      <button type="button" data-filter="all" class="active">All</button>
      <button type="button" data-filter="economy">Economy</button>
      <button type="button" data-filter="monster">Monster</button>
      <button type="button" data-filter="devilfruit">Devil Fruit</button>
      <button type="button" data-filter="combat">Combat</button>
      <button type="button" data-filter="quest">Quest</button>
    </div>
    <div class="si-timeline"></div>`;
  tabPanels.get('world')!.appendChild(worldEl);

  const perfEl = document.createElement('div');
  perfEl.className = 'si-performance';
  tabPanels.get('performance')!.appendChild(perfEl);

  const settingsEl = document.createElement('div');
  settingsEl.className = 'si-settings';
  settingsEl.innerHTML = buildSettingsHtml();
  tabPanels.get('settings')!.appendChild(settingsEl);

  const timeMachineEl = document.createElement('div');
  timeMachineEl.className = 'si-time-machine';
  timeMachineEl.innerHTML = `
    <div class="si-tm-label">Time Machine</div>
    <input type="range" class="si-tm-scrub" min="0" max="1000" value="0" />
    <span class="si-tm-time">live</span>`;
  windowEl.appendChild(timeMachineEl);

  const liveCellEl = document.createElement('div');
  liveCellEl.className = 'si-live-panel';
  liveCellEl.innerHTML = '<div class="si-live-empty">Select a monster (Select Mode)</div>';
  windowEl.appendChild(liveCellEl);

  let collapsed = persisted.collapsed;
  if (collapsed) windowEl.classList.add('collapsed');

  // Drag
  let dragX = 0;
  let dragY = 0;
  header.addEventListener('mousedown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    dragX = e.clientX - windowEl.offsetLeft;
    dragY = e.clientY - windowEl.offsetTop;
    const onMove = (ev: MouseEvent) => {
      windowEl.style.left = `${ev.clientX - dragX}px`;
      windowEl.style.top = `${ev.clientY - dragY}px`;
      persistGeometry();
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  header.querySelector('.si-close')!.addEventListener('click', () => setVisible(false));
  header.querySelector('.si-collapse')!.addEventListener('click', () => {
    collapsed = !collapsed;
    windowEl.classList.toggle('collapsed', collapsed);
    persistGeometry();
  });

  tabsEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.si-tab');
    if (!btn?.dataset.tab) return;
    switchTab(btn.dataset.tab as SimulationInspectorTab);
  });

  worldEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-filter]');
    if (!btn?.dataset.filter) return;
    timelineFilter = btn.dataset.filter as SimulationEventCategory | 'all';
    worldEl.querySelectorAll('.si-world-filters button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    renderWorld();
  });

  settingsEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-setting]');
    if (!btn?.dataset.setting) return;
    applySetting(btn.dataset.setting);
    renderSettings();
    renderOverview();
  });

  settingsEl.addEventListener('change', (e) => {
    const sel = (e.target as HTMLElement).closest<HTMLSelectElement>('select[data-heatmap]');
    if (!sel) return;
    heatmap = sel.value as HeatmapMode;
    deps.devilFruitInfluence.debugHeatmapEnabled = heatmap !== 'none';
    deps.cellularWorld.debugMarkersEnabled = controller.debugColors;
    persistGeometry();
    renderSettings();
  });

  const scrubInput = timeMachineEl.querySelector<HTMLInputElement>('.si-tm-scrub')!;
  scrubInput.addEventListener('input', () => {
    const ratio = Number(scrubInput.value) / 1000;
    if (ratio <= 0.01) {
      timeMachine.clearScrub();
      timeMachineEl.querySelector('.si-tm-time')!.textContent = 'live';
    } else {
      const snap = timeMachine.setScrubPosition(ratio);
      timeMachineEl.querySelector('.si-tm-time')!.textContent = snap ? formatTimeLabel(snap.at) : '—';
    }
    renderOverview();
    renderCombat();
    renderDevilFruitExtras();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'F12') {
      e.preventDefault();
      setVisible(!visible);
    }
  });

  const canvas = deps.game.renderer.domElement;
  canvas.addEventListener('click', (e) => {
    if (!visible || !selectMode) return;
    const picked = pickWorldFromClick(e, canvas, deps.game.camera);
    if (!picked) return;
    const monster = deps.monsterManager.findMonsterNear(picked.x, picked.z, 3);
    if (!monster?.cellularId) return;
    selectedCell = {
      cellId: monster.cellularId,
      index: deps.monsterManager.getMonsterIndex(monster),
    };
    renderLiveCell();
    eventBus.emit('monster', `Selected monster #${selectedCell.index}`, deps.cellularWorld.metrics.tick);
  });

  function switchTab(tab: SimulationInspectorTab): void {
    activeTab = tab;
    tabsEl.querySelectorAll('.si-tab').forEach((el) => {
      el.classList.toggle('active', (el as HTMLElement).dataset.tab === tab);
    });
    tabPanels.forEach((panel, key) => {
      panel.classList.toggle('active', key === tab);
    });
    persistGeometry();
    refresh();
  }

  function setVisible(show: boolean): void {
    visible = show;
    root.style.display = show ? 'flex' : 'none';
    if (show) refresh();
    influenceVisualizer.setEnabled(show && persisted.influenceOverlay);
  }

  function applySetting(action: string): void {
    switch (action) {
      case 'pause':
        controller.togglePause();
        break;
      case 'step':
        controller.requestStep();
        break;
      case 'speed-1':
        controller.setSpeed(1);
        break;
      case 'speed-5':
        controller.setSpeed(5);
        break;
      case 'speed-20':
        controller.setSpeed(20);
        break;
      case 'speed-100':
        controller.setSpeed(100);
        break;
      case 'freeze-economy':
        controller.setFreezeEconomy(!controller.freezeEconomy);
        break;
      case 'freeze-monster':
        controller.setFreezeMonster(!controller.freezeMonster);
        break;
      case 'freeze-df':
        controller.setFreezeDevilFruit(!controller.freezeDevilFruit);
        break;
      case 'debug-colors':
        controller.setDebugColors(!controller.debugColors);
        deps.cellularWorld.debugMarkersEnabled = controller.debugColors;
        break;
      case 'toggle-heatmap':
        heatmap = heatmap === 'none' ? 'monster-density' : 'none';
        deps.devilFruitInfluence.debugHeatmapEnabled = heatmap !== 'none';
        break;
      case 'influence-overlay':
        persisted.influenceOverlay = !persisted.influenceOverlay;
        influenceVisualizer.setEnabled(persisted.influenceOverlay && visible);
        break;
      case 'select-mode':
        selectMode = !selectMode;
        break;
      case 'reset-panels':
        Object.assign(persisted, resetInspectorState());
        applyWindowGeometry(windowEl, persisted);
        switchTab('overview');
        heatmap = 'none';
        selectMode = false;
        selectedCell = null;
        break;
      default:
        break;
    }
    persistGeometry();
  }

  function captureSnapshot(): SimulationSnapshot {
    const m = deps.cellularWorld.metrics;
    const e = deps.living.state;
    const inf = deps.devilFruitInfluence.metrics;
    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    const orders = e.orders.filter((o) => o.status === 'open' || o.status === 'assigned' || o.status === 'in-transit').length;
    let economyPressure = 0;
    for (const cell of e.cells) {
      for (const item of Object.values(cell.commodities)) {
        if (!item) continue;
        if (item.marketState === 'shortage' || item.marketState === 'crisis') economyPressure += 1;
      }
    }
    return {
      at: Date.now(),
      worldTick: controller.worldTick,
      economyTick: e.tick,
      monsterTick: m.tick,
      influenceCount: inf.activeEffects,
      fps: deps.game.fps,
      frameTimeMs: deps.game.fps > 0 ? 1000 / deps.game.fps : 0,
      memoryMb: mem ? mem.usedJSHeapSize / (1024 * 1024) : 0,
      monsterCount: deps.monsterManager.getAliveMonsterCount(),
      npcCount: deps.npcCount(),
      devilFruitAreas: inf.activeEffects,
      tradeOrders: orders,
      economyPressure,
      monsterStateCounts: { ...m.stateCounts },
      influenceByType: { ...inf.byType },
      combatPressure: m.combat?.combatPressure ?? 0,
    };
  }

  function activeData(): SimulationSnapshot {
    return timeMachine.activeSnapshot ?? captureSnapshot();
  }

  function renderOverview(): void {
    const d = activeData();
    overviewEl.innerHTML = `
      <div class="si-stat-grid">
        <div>World Tick <b>${d.worldTick}</b></div>
        <div>Simulation Speed <b>${controller.speed}x</b></div>
        <div>Paused <b>${controller.paused ? 'yes' : 'no'}</b></div>
        <div>Economy Tick <b>${d.economyTick}</b></div>
        <div>Monster Tick <b>${d.monsterTick}</b></div>
        <div>Influence Count <b>${d.influenceCount}</b></div>
        <div>FPS <b>${d.fps}</b></div>
        <div>Frame Time <b>${d.frameTimeMs.toFixed(1)} ms</b></div>
        <div>Memory <b>${d.memoryMb.toFixed(1)} MB</b></div>
        <div>Total Monsters <b>${d.monsterCount}</b></div>
        <div>Total NPC <b>${d.npcCount}</b></div>
        <div>Devil Fruit Areas <b>${d.devilFruitAreas}</b></div>
        <div>Trade Orders <b>${d.tradeOrders}</b></div>
      </div>
      ${timeMachine.isScrubbing ? '<div class="si-scrub-hint">⏪ Time Machine scrubbing historical snapshot</div>' : ''}`;
  }

  function renderCombat(): void {
    const m = deps.cellularWorld.metrics;
    const c = m.combat;
    const roles = countRoles(deps);
    combatEl.innerHTML = `
      <div class="si-stat-grid">
        <div>Attack Pressure <b>${c?.averageAttackInfluence.toFixed(2) ?? '0'}</b></div>
        <div>Flee Pressure <b>${c?.averageFleeInfluence.toFixed(2) ?? '0'}</b></div>
        <div>Combat Cohesion <b>${c?.packCohesion.toFixed(2) ?? '0'}</b></div>
        <div>Combat Pressure <b>${c?.combatPressure.toFixed(2) ?? '0'}</b></div>
        <div>Active Attackers <b>${m.stateCounts.attack ?? 0}</b></div>
      </div>
      <div class="si-role-grid">
        <div>Frontliner <b>${roles.frontliner}</b></div>
        <div>Flanker <b>${roles.flanker}</b></div>
        <div>Watcher <b>${roles.watcher}</b></div>
        <div>Retreater <b>${roles.retreater}</b></div>
      </div>`;
  }

  function renderDevilFruitExtras(): void {
    const extra = tabPanels.get('devilfruit')!.querySelector('.si-df-extra');
    if (!extra) {
      const div = document.createElement('div');
      div.className = 'si-df-extra';
      tabPanels.get('devilfruit')!.appendChild(div);
    }
    const d = activeData();
    const el = tabPanels.get('devilfruit')!.querySelector('.si-df-extra')!;
    const types = DEVIL_FRUIT_EFFECT_TYPES.map((t) => `<div>${t}: <b>${d.influenceByType[t] ?? 0}</b></div>`).join('');
    el.innerHTML = `<div class="si-stat-grid">${types}</div>
      <div>Heatmap: <b>${HEATMAP_LABELS[heatmap]}</b></div>
      <div>Area Lifetime: active <b>${d.devilFruitAreas}</b></div>`;
  }

  function renderPerformance(): void {
    const renderer = deps.game.renderer;
    perfEl.innerHTML = `
      <div class="si-stat-grid">
        <div>FPS <b>${deps.game.fps}</b></div>
        <div>CPU Frame <b>${deps.game.fps > 0 ? (1000 / deps.game.fps).toFixed(1) : 0} ms</b></div>
        <div>Economy Tick <b>${perf.economyTickMs.toFixed(2)} ms</b></div>
        <div>Monster Tick <b>${perf.monsterTickMs.toFixed(2)} ms</b></div>
        <div>Devil Fruit Tick <b>${perf.devilFruitTickMs.toFixed(2)} ms</b></div>
        <div>Render <b>${perf.renderMs.toFixed(2)} ms</b></div>
        <div>Neighbor Queries <b>${perf.neighborQueries}</b></div>
        <div>Spatial Grid Queries <b>${perf.spatialQueries}</b></div>
        <div>Total Active Cells <b>${perf.activeCells}</b></div>
        <div>Draw Calls <b>${renderer.info.render.calls}</b></div>
        <div>Triangles <b>${renderer.info.render.triangles}</b></div>
      </div>`;
  }

  function renderWorld(): void {
    const list = eventBus.getEvents(timelineFilter);
    const el = worldEl.querySelector('.si-timeline')!;
    el.innerHTML = list.slice(0, 80).map((ev) =>
      `<div class="si-event"><span class="si-ev-cat">${ev.category}</span>
        <span class="si-ev-time">${formatTimeLabel(ev.at)}</span> ${ev.message}</div>`,
    ).join('') || '<div class="si-empty">No events yet</div>';
  }

  function renderSettings(): void {
    settingsEl.innerHTML = buildSettingsHtml();
  }

  function renderLiveCell(): void {
    if (!selectedCell) {
      liveCellEl.innerHTML = '<div class="si-live-empty">Select a monster (Select Mode)</div>';
      return;
    }
    const pos = deps.playerPosition();
    const details = buildLiveCellDetails(deps.cellularWorld, selectedCell, pos.x, pos.z);
    liveCellEl.innerHTML = details ? renderLiveCellHtml(details) : '<div class="si-live-empty">Cell not found</div>';
  }

  function buildSettingsHtml(): string {
    return `
      <div class="si-settings-grid">
        <button type="button" data-setting="pause">${controller.paused ? 'Resume' : 'Pause'} Simulation</button>
        <button type="button" data-setting="step">Step One Tick</button>
        <button type="button" data-setting="speed-1" class="${controller.speed === 1 ? 'active' : ''}">1x</button>
        <button type="button" data-setting="speed-5" class="${controller.speed === 5 ? 'active' : ''}">5x</button>
        <button type="button" data-setting="speed-20" class="${controller.speed === 20 ? 'active' : ''}">20x</button>
        <button type="button" data-setting="speed-100" class="${controller.speed === 100 ? 'active' : ''}">100x</button>
        <button type="button" data-setting="freeze-economy" class="${controller.freezeEconomy ? 'active' : ''}">Freeze Economy</button>
        <button type="button" data-setting="freeze-monster" class="${controller.freezeMonster ? 'active' : ''}">Freeze Monster</button>
        <button type="button" data-setting="freeze-df" class="${controller.freezeDevilFruit ? 'active' : ''}">Freeze Devil Fruit</button>
        <button type="button" data-setting="debug-colors" class="${controller.debugColors ? 'active' : ''}">Toggle Debug Colors</button>
        <button type="button" data-setting="toggle-heatmap" class="${heatmap !== 'none' ? 'active' : ''}">Toggle Heatmaps</button>
        <button type="button" data-setting="influence-overlay" class="${persisted.influenceOverlay ? 'active' : ''}">Influence Visualizer</button>
        <button type="button" data-setting="select-mode" class="${selectMode ? 'active' : ''}">Select Mode</button>
        <button type="button" data-setting="reset-panels">Reset Panels</button>
      </div>
      <label class="si-heatmap-select">Heatmap
        <select data-heatmap>${heatmapModesList().map((m) =>
          `<option value="${m}"${m === heatmap ? ' selected' : ''}>${HEATMAP_LABELS[m]}</option>`,
        ).join('')}</select>
      </label>`;
  }

  function persistGeometry(): void {
    saveInspectorState({
      x: windowEl.offsetLeft,
      y: windowEl.offsetTop,
      width: windowEl.offsetWidth,
      height: windowEl.offsetHeight,
      collapsed,
      activeTab,
      heatmap,
      influenceOverlay: persisted.influenceOverlay,
      selectMode,
    });
  }

  function refresh(): void {
    if (!visible) return;
    economyPanel.refresh();
    monsterPanel.refresh();
    devilPanel.refresh();
    renderOverview();
    renderCombat();
    renderDevilFruitExtras();
    renderPerformance();
    renderWorld();
    renderSettings();
    renderLiveCell();
  }

  function update(dt: number): void {
    controller.bumpWorldTick();
    influenceVisualizer.update(dt);
    perf.activeCells = deps.cellularWorld.getAllCells().length;
    perf.neighborQueries = deps.cellularWorld.metrics.averageNeighborCount * perf.activeCells;
    perf.spatialQueries = deps.devilFruitInfluence.metrics.activeEffects;
    timeMachine.capture(captureSnapshot());
    if (visible) refresh();
  }

  function recordEconomyTick(ms: number): void {
    perf.economyTickMs = ms;
  }
  function recordMonsterTick(ms: number): void {
    perf.monsterTickMs = ms;
  }
  function recordDevilFruitTick(ms: number): void {
    perf.devilFruitTickMs = ms;
  }
  function recordRender(ms: number): void {
    perf.renderMs = ms;
  }

  if (visible) refresh();
  influenceVisualizer.setEnabled(persisted.influenceOverlay && visible);

  return {
    controller,
    eventBus,
    timeMachine,
    influenceVisualizer,
    setVisible,
    refresh,
    update,
    recordEconomyTick,
    recordMonsterTick,
    recordDevilFruitTick,
    recordRender,
    dispose: () => {
      root.remove();
      influenceVisualizer.dispose();
    },
  };
}

function countRoles(deps: SimulationInspectorDeps): Record<string, number> {
  const roles = { frontliner: 0, flanker: 0, watcher: 0, retreater: 0 };
  const pos = deps.playerPosition();
  for (const cell of deps.cellularWorld.getAllCells()) {
    if (cell.currentState === 'dead') continue;
    const snap = deps.cellularWorld.snapshots.get(cell.id);
    const dist = Math.hypot(cell.position.x - pos.x, cell.position.z - pos.z);
    const r = resolveEmergentRole(cell, snap ?? {
      idleCount: 0, alertCount: 0, huntCount: 0, attackCount: 0, fleeCount: 0,
      regroupCount: 0, restCount: 0, deadCount: 0, idleInfluence: 0, alertInfluence: 0,
      huntInfluence: 0, attackInfluence: 0, fleeInfluence: 0, regroupInfluence: 0,
      restInfluence: 0, deadInfluence: 0, playerNearby: false, nearestPlayerDistance: 99,
      playerInAttackRange: false, monsterDensity: 0, monsterDensityInfluence: 0, neighborCount: 0,
      bossInfluence: 0, fireInfluence: 0, iceInfluence: 0, lightningInfluence: 0,
      smokeDensity: 0, poisonInfluence: 0, earthquakeInfluence: 0, areaMovementFactor: 1,
      areaCohesionFactor: 1, areaVisionFactor: 1,
    }, dist);
    roles[r] += 1;
  }
  return roles;
}

function applyWindowGeometry(el: HTMLElement, p: { x: number; y: number; width: number; height: number }): void {
  el.style.left = `${p.x}px`;
  el.style.top = `${p.y}px`;
  el.style.width = `${p.width}px`;
  el.style.height = `${p.height}px`;
}

function pickWorldFromClick(
  e: MouseEvent,
  canvas: HTMLCanvasElement,
  camera: THREE.PerspectiveCamera,
): { x: number; z: number } | null {
  const rect = canvas.getBoundingClientRect();
  const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2(nx, ny);
  ray.setFromCamera(ndc, camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  if (!ray.ray.intersectPlane(plane, hit)) return null;
  return { x: hit.x, z: hit.z };
}

function injectStyles(): void {
  if (document.getElementById('si-styles')) return;
  const style = document.createElement('style');
  style.id = 'si-styles';
  style.textContent = `
    .si-root{position:fixed;inset:0;z-index:80;pointer-events:none}
    .si-window{position:absolute;pointer-events:auto;display:flex;flex-direction:column;
      background:#0b1220;border:1px solid #3d5a80;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.55);
      color:#e8f0ff;font:500 11px 'Segoe UI',Tahoma,sans-serif;min-width:320px;min-height:200px;overflow:hidden}
    .si-window.collapsed .si-body,.si-window.collapsed .si-tabs,.si-window.collapsed .si-time-machine,
    .si-window.collapsed .si-live-panel{display:none}
    .si-header{display:flex;align-items:center;gap:8px;padding:8px 10px;background:#152238;cursor:move;user-select:none}
    .si-title{flex:1;font-weight:700;color:#9fd4ff}
    .si-header button{background:0;border:0;color:#fff;font-size:16px;cursor:pointer;padding:2px 6px}
    .si-tabs{display:flex;flex-wrap:wrap;gap:2px;padding:4px 6px;background:#101a2a;border-bottom:1px solid #2a3f5f}
    .si-tab{padding:4px 8px;border:0;border-radius:6px;background:transparent;color:#9eb5d8;cursor:pointer;font-size:10px}
    .si-tab.active{background:#2a4a70;color:#fff}
    .si-body{flex:1;overflow:auto;padding:8px;min-height:0}
    .si-panel{display:none}
    .si-panel.active{display:block}
    .si-stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:6px}
    .si-stat-grid b{color:#9fd4ff}
    .si-role-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px}
    .si-time-machine{display:flex;align-items:center;gap:8px;padding:6px 10px;border-top:1px solid #2a3f5f;background:#0e1728}
    .si-tm-label{font-size:9px;color:#8eb5d8;text-transform:uppercase}
    .si-tm-scrub{flex:1}
    .si-tm-time{min-width:64px;font-size:10px;color:#9fd4ff}
    .si-live-panel{border-top:1px solid #2a3f5f;padding:8px 10px;background:#0e1728;max-height:140px;overflow:auto}
    .si-live-title{font-weight:700;color:#ffe08a;margin-bottom:4px}
    .si-live-neighbors{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:4px;font-size:10px}
    .si-live-empty{color:#7a9ab8;font-size:10px}
    .si-world-filters{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}
    .si-world-filters button{padding:3px 8px;border-radius:6px;border:1px solid #3d5a80;background:#152238;color:#cfe0ff;cursor:pointer;font-size:9px}
    .si-world-filters button.active{background:#2a5a90}
    .si-timeline{font-size:10px;line-height:1.45;max-height:280px;overflow:auto}
    .si-event{padding:3px 0;border-bottom:1px solid rgba(255,255,255,.05)}
    .si-ev-cat{color:#8eb5d8;margin-right:6px;text-transform:uppercase;font-size:8px}
    .si-ev-time{color:#6a8aaa;margin-right:6px}
    .si-settings-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:6px}
    .si-settings-grid button{padding:6px 8px;border-radius:6px;border:1px solid #3d5a80;background:#152238;color:#e8f0ff;cursor:pointer;font-size:9px}
    .si-settings-grid button.active{background:#2a6a50;border-color:#4a9a70}
    .si-heatmap-select{display:block;margin-top:10px;font-size:10px}
    .si-heatmap-select select{margin-left:6px}
    .si-scrub-hint{margin-top:8px;color:#ffb86c;font-size:10px}
    .si-empty{color:#7a9ab8}`;
  document.head.appendChild(style);
}
