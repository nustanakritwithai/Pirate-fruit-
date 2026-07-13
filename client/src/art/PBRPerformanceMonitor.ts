import type { Game } from '../engine/Game';

/** เปิดด้วย ?debugPBR=1; ไม่สร้าง DOM หรือ poll เมื่อเล่นปกติ */
export class PBRPerformanceMonitor {
  private readonly root: HTMLPreElement | null;
  private elapsed = 0;

  constructor(private game: Game) {
    if (new URLSearchParams(location.search).get('debugPBR') !== '1') {
      this.root = null;
      return;
    }
    this.root = document.createElement('pre');
    this.root.style.cssText = `position:fixed;right:8px;bottom:8px;z-index:95;pointer-events:none;
      margin:0;padding:8px 10px;border-radius:8px;color:#bfffd4;background:rgba(2,12,17,.82);
      font:10px/1.42 monospace;text-shadow:0 1px 2px #000`;
    document.body.appendChild(this.root);
    this.render();
  }

  update(dt: number): void {
    if (!this.root) return;
    this.elapsed += dt;
    if (this.elapsed < 0.5) return;
    this.elapsed = 0;
    this.render();
  }

  private render(): void {
    if (!this.root) return;
    const renderer = this.game.renderer;
    const calls = renderer.info.render.calls;
    const triangles = renderer.info.render.triangles;
    const overBudget = calls > this.game.graphics.maxDrawCalls ||
      triangles > this.game.graphics.maxVisibleTriangles;
    this.root.style.color = overBudget ? '#ffb08c' : '#bfffd4';
    this.root.textContent = [
      `Mobile PBR · ${this.game.graphics.label}`,
      `FPS ${this.game.fps} · ${this.game.fps > 0 ? (1000 / this.game.fps).toFixed(1) : '0'} ms`,
      `Draw ${calls}/${this.game.graphics.maxDrawCalls}`,
      `Tris ${triangles}/${this.game.graphics.maxVisibleTriangles}`,
      `Geo ${renderer.info.memory.geometries} · Tex ${renderer.info.memory.textures}`,
      `Programs ${renderer.info.programs?.length ?? 0}`,
    ].join('\n');
  }
}
