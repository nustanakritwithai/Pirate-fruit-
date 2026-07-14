import type { MonsterCellularWorld } from './MonsterCellularWorld';
import type { MonsterThoughtState } from './MonsterCellularTypes';
import { THOUGHT_STATES } from './MonsterCellularTypes';
import type { DebugPanelEmbedOptions } from '../../simulation/inspector/DebugPanelEmbed';

/**
 * Cellular Monster Debug — เปิดด้วย ?cellular=1 หรือกด F9
 * (F8 ใช้โดย Economy debug)
 */
export class MonsterCellularDebugPanel {
  private readonly root: HTMLDivElement;
  private visible = false;
  private readonly embedded: boolean;

  constructor(
    private world: MonsterCellularWorld,
    options: DebugPanelEmbedOptions = {},
  ) {
    this.embedded = options.embedded ?? false;
    this.injectStyles();
    this.root = document.createElement('div');
    this.root.className = this.embedded ? 'mcell-debug-root mcell-debug-embedded' : 'mcell-debug-root';
    this.root.innerHTML = `
      <div class="mcell-debug">
        <div class="mcell-debug-head">
          <h3>🧠 Monster Cellular AI (M1)</h3>
          ${this.embedded ? '' : '<button type="button" class="mcell-close">×</button>'}
        </div>
        <div class="mcell-stats"></div>
        <div class="mcell-legend">
          <span class="c-idle">Gray Idle</span>
          <span class="c-alert">Yellow Alert</span>
          <span class="c-hunt">Orange Hunt</span>
          <span class="c-attack">Red Attack</span>
          <span class="c-flee">Blue Flee</span>
          <span class="c-regroup">Green Regroup</span>
        </div>
        <div class="mcell-actions">
          <button type="button" data-action="toggle-markers">Toggle Markers</button>
          <button type="button" data-action="force-alert">Force Alert All</button>
          <button type="button" data-action="force-hunt">Force Hunt All</button>
          <button type="button" data-action="force-flee">Force Flee All</button>
        </div>
      </div>`;
    (options.mountParent ?? document.body).appendChild(this.root);
    if (!this.embedded) {
      this.root.querySelector('.mcell-close')?.addEventListener('click', () => this.setVisible(false));
    }
    this.root.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'toggle-markers') {
        this.world.debugMarkersEnabled = !this.world.debugMarkersEnabled;
      }
      if (action === 'force-alert') this.forceState('alert');
      if (action === 'force-hunt') this.forceState('hunt');
      if (action === 'force-flee') this.forceState('flee');
      this.render();
    });
    if (!this.embedded) {
      if (new URLSearchParams(location.search).has('cellular')) this.setVisible(true);
      window.addEventListener('keydown', (e) => {
        if (e.key === 'F9') {
          e.preventDefault();
          this.setVisible(!this.visible);
        }
      });
    } else {
      this.visible = true;
    }
    this.root.style.display = this.embedded ? 'block' : 'none';
  }

  setVisible(show: boolean): void {
    this.visible = show;
    this.root.style.display = show ? (this.embedded ? 'block' : 'flex') : 'none';
    if (show) this.render();
  }

  getElement(): HTMLDivElement {
    return this.root;
  }

  refresh(): void {
    if (this.visible) this.render();
  }

  private forceState(state: MonsterThoughtState): void {
    for (const cell of this.world.getAllCells()) {
      if (cell.currentState === 'dead') continue;
      cell.currentState = state;
      cell.nextState = state;
    }
  }

  private render(): void {
    const m = this.world.metrics;
    const c = m.combat;
    const rows = THOUGHT_STATES.map((s) => `<div>${s}: ${m.stateCounts[s] ?? 0}</div>`).join('');
    const combatRows = c
      ? `<div class="mcell-combat">
          <div><b>Combat (CE1)</b></div>
          <div>Attack Influence: ${c.averageAttackInfluence.toFixed(2)}</div>
          <div>Flee Influence: ${c.averageFleeInfluence.toFixed(2)}</div>
          <div>Pack Cohesion: ${c.packCohesion.toFixed(2)}</div>
          <div>Combat Pressure: ${c.combatPressure.toFixed(2)}</div>
          <div>Decision Time: ${c.averageDecisionTimeMs.toFixed(2)} ms</div>
        </div>`
      : '';
    this.root.querySelector('.mcell-stats')!.innerHTML = `
      <div>Monsters: ${m.monsterCount}</div>
      <div>Cellular Tick: ${m.tick}</div>
      <div>Transitions (last): ${m.transitionCount}</div>
      <div>Avg Neighbors: ${m.averageNeighborCount.toFixed(2)}</div>
      <div>Tick Time: ${m.lastTickDurationMs.toFixed(2)} ms</div>
      ${combatRows}
      <div class="mcell-states">${rows}</div>
      <div>Markers: ${this.world.debugMarkersEnabled ? 'DEBUG ON' : 'Combat signals'}</div>`;
  }

  private injectStyles(): void {
    if (document.getElementById('mcell-debug-styles')) return;
    const style = document.createElement('style');
    style.id = 'mcell-debug-styles';
    style.textContent = `
      .mcell-debug-root{position:fixed;right:12px;top:12px;z-index:55}
      .mcell-debug{width:280px;background:#120a18;border:1px solid #6a4a8a;border-radius:10px;
        padding:10px;color:#f0e6ff;font:500 11px sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.45)}
      .mcell-debug-head{display:flex;align-items:center;margin-bottom:8px}
      .mcell-debug-head h3{margin:0;flex:1;font-size:13px;color:#d8b4ff}
      .mcell-close{background:0;border:0;color:#fff;font-size:18px;cursor:pointer}
      .mcell-stats{font-size:10px;line-height:1.5;margin-bottom:8px}
      .mcell-states{display:grid;grid-template-columns:1fr 1fr;gap:2px;margin-top:4px}
      .mcell-combat{margin:6px 0;padding:6px;border-radius:6px;background:rgba(255,152,0,.08);border:1px solid rgba(255,152,0,.25)}
      .mcell-legend{display:flex;flex-wrap:wrap;gap:4px;font-size:9px;margin-bottom:8px}
      .mcell-legend span{padding:2px 4px;border-radius:4px;background:rgba(255,255,255,.06)}
      .c-idle{border-left:3px solid #9e9e9e}
      .c-alert{border-left:3px solid #ffeb3b}
      .c-hunt{border-left:3px solid #ff9800}
      .c-attack{border-left:3px solid #f44336}
      .c-flee{border-left:3px solid #2196f3}
      .c-regroup{border-left:3px solid #4caf50}
      .mcell-actions{display:flex;flex-wrap:wrap;gap:4px}
      .mcell-actions button{padding:3px 8px;border-radius:6px;border:1px solid #6a4a8a;
        background:#2a1838;color:#f0e6ff;cursor:pointer;font-size:9px}
      .mcell-debug-embedded{position:static;right:auto;top:auto}
      .mcell-debug-embedded .mcell-debug{width:100%;box-shadow:none;border:0}
      .mcell-debug-embedded .mcell-debug-head{display:none}
    `;
    document.head.appendChild(style);
  }
}
