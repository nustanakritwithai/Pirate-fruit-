import type { DevilFruitInfluenceWorld } from './DevilFruitInfluenceWorld';
import { DEVIL_FRUIT_INFLUENCE_CONFIG, EFFECT_COLORS } from './DevilFruitInfluenceConfig';
import { DEVIL_FRUIT_EFFECT_TYPES } from './DevilFruitInfluenceTypes';
import type { DebugPanelEmbedOptions } from '../../simulation/inspector/DebugPanelEmbed';

/** DF1 debug — F10 influence heatmap & active areas */
export class DevilFruitInfluenceDebugPanel {
  private readonly root: HTMLDivElement;
  private visible = false;
  private readonly embedded: boolean;

  constructor(
    private world: DevilFruitInfluenceWorld,
    options: DebugPanelEmbedOptions = {},
  ) {
    this.embedded = options.embedded ?? false;
    this.injectStyles();
    this.root = document.createElement('div');
    this.root.className = this.embedded ? 'df1-debug-root df1-debug-embedded' : 'df1-debug-root';
    this.root.innerHTML = `
      <div class="df1-debug">
        <div class="df1-head">
          <h3>🍎 Devil Fruit Influence (DF1)</h3>
          ${this.embedded ? '' : '<button type="button" class="df1-close">×</button>'}
        </div>
        <div class="df1-stats"></div>
        <div class="df1-legend"></div>
        <canvas class="df1-heatmap" width="200" height="120"></canvas>
        <div class="df1-actions">
          <button type="button" data-action="spawn-fire">Spawn Fire</button>
          <button type="button" data-action="spawn-smoke">Spawn Smoke</button>
          <button type="button" data-action="spawn-ice">Spawn Ice</button>
          <button type="button" data-action="clear">Clear All</button>
        </div>
      </div>`;
    (options.mountParent ?? document.body).appendChild(this.root);
    if (!this.embedded) {
      this.root.querySelector('.df1-close')?.addEventListener('click', () => this.setVisible(false));
    }
    this.root.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'spawn-fire') this.world.spawnEffect({ type: 'fire', x: 0, z: 0 });
      if (action === 'spawn-smoke') this.world.spawnEffect({ type: 'smoke', x: 4, z: 2 });
      if (action === 'spawn-ice') this.world.spawnEffect({ type: 'ice', x: -3, z: 3 });
      if (action === 'clear') this.world.clear();
      this.render();
    });
    if (!this.embedded) {
      if (new URLSearchParams(location.search).has('df1')) this.setVisible(true);
      window.addEventListener('keydown', (e) => {
        if (e.key === 'F10') {
          e.preventDefault();
          this.setVisible(!this.visible);
        }
      });
    } else {
      this.visible = true;
    }
    this.root.style.display = this.embedded ? 'block' : 'none';
    this.renderLegend();
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

  private renderLegend(): void {
    const el = this.root.querySelector('.df1-legend')!;
    el.innerHTML = DEVIL_FRUIT_EFFECT_TYPES.map(
      (t) => `<span style="border-left:3px solid ${EFFECT_COLORS[t]}">${t}</span>`,
    ).join('');
  }

  private render(): void {
    const m = this.world.metrics;
    const effects = this.world.getEffects();
    this.root.querySelector('.df1-stats')!.innerHTML = `
      <div>Active Effects: ${m.activeEffects}</div>
      <div>Tick: ${m.lastTickMs.toFixed(2)} ms</div>
      <div>Economy Pressures: ${m.economyPressuresEmitted}</div>
      <div>Fire Areas: ${m.byType.fire ?? 0}</div>
      <div>Smoke Areas: ${m.byType.smoke ?? 0}</div>
      <div>Ice Areas: ${m.byType.ice ?? 0}</div>
      <div>Lightning Areas: ${m.byType.lightning ?? 0}</div>`;

    const canvas = this.root.querySelector<HTMLCanvasElement>('.df1-heatmap')!;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#0a0810';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const step = DEVIL_FRUIT_INFLUENCE_CONFIG.heatmapGridStep;
    for (let gx = -20; gx <= 20; gx += step) {
      for (let gz = -12; gz <= 12; gz += step) {
        const s = this.world.sampleAt(gx, gz);
        const heat = Math.min(1, (s.fire + s.smoke + s.ice + s.lightning) / 4);
        if (heat < 0.05) continue;
        const px = ((gx + 20) / 40) * canvas.width;
        const py = ((gz + 12) / 24) * canvas.height;
        ctx.fillStyle = `rgba(255,120,40,${heat * 0.75})`;
        ctx.fillRect(px, py, 5, 5);
      }
    }
    for (const e of effects) {
      const px = ((e.x + 20) / 40) * canvas.width;
      const py = ((e.z + 12) / 24) * canvas.height;
      ctx.strokeStyle = EFFECT_COLORS[e.type];
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private injectStyles(): void {
    if (document.getElementById('df1-debug-styles')) return;
    const style = document.createElement('style');
    style.id = 'df1-debug-styles';
    style.textContent = `
      .df1-debug-root{position:fixed;left:12px;top:12px;z-index:56}
      .df1-debug{width:240px;background:#140a10;border:1px solid #8a4a3a;border-radius:10px;
        padding:10px;color:#ffe8e0;font:500 11px sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.45)}
      .df1-head{display:flex;align-items:center;margin-bottom:8px}
      .df1-head h3{margin:0;flex:1;font-size:13px;color:#ffab91}
      .df1-close{background:0;border:0;color:#fff;font-size:18px;cursor:pointer}
      .df1-stats{font-size:10px;line-height:1.5;margin-bottom:6px}
      .df1-legend{display:flex;flex-wrap:wrap;gap:3px;font-size:8px;margin-bottom:6px}
      .df1-legend span{padding:2px 4px;background:rgba(255,255,255,.05);border-radius:3px}
      .df1-heatmap{width:100%;border-radius:6px;margin-bottom:6px;background:#000}
      .df1-actions{display:flex;flex-wrap:wrap;gap:4px}
      .df1-actions button{padding:3px 6px;border-radius:6px;border:1px solid #8a4a3a;
        background:#2a1410;color:#ffe8e0;cursor:pointer;font-size:8px}
      .df1-debug-embedded{position:static;left:auto;top:auto}
      .df1-debug-embedded .df1-debug{width:100%;box-shadow:none;border:0}
      .df1-debug-embedded .df1-head{display:none}`;
    document.head.appendChild(style);
  }
}
