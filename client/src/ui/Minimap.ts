import type { CharacterController } from '../player/CharacterController';
import { WATER_LEVEL } from '../world/World';
import { isTouchDevice } from '../engine/device';
import { ALL_WORLD_POI_LIST } from '../world/WorldPOI';
import { ISLANDS, findIslandAt, worldHeightAt } from '../island/IslandRegistry';
import type { IslandId } from '../island/IslandTypes';

export interface MinimapView {
  id: IslandId | 'ocean-overview';
  label: string;
  centerX: number;
  centerZ: number;
  radius: number;
}

function createOceanOverview(): MinimapView {
  const minX = Math.min(...ISLANDS.map((island) => island.center.x - island.radius));
  const maxX = Math.max(...ISLANDS.map((island) => island.center.x + island.radius));
  const minZ = Math.min(...ISLANDS.map((island) => island.center.z - island.radius));
  const maxZ = Math.max(...ISLANDS.map((island) => island.center.z + island.radius));
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const radius = Math.max(...ISLANDS.map((island) =>
    Math.hypot(island.center.x - centerX, island.center.z - centerZ) + island.radius,
  )) * 1.08;
  return { id: 'ocean-overview', label: 'ทะเลสามเกาะ', centerX, centerZ, radius };
}

const OCEAN_OVERVIEW = createOceanOverview();

/** เลือกมุมมอง local เมื่ออยู่ใกล้เกาะ และภาพรวมทะเลเมื่ออยู่ระหว่างเกาะ */
export function getMinimapView(x: number, z: number): MinimapView {
  const island = findIslandAt(x, z, 18);
  if (island) {
    return {
      id: island.id,
      label: island.name,
      centerX: island.center.x,
      centerZ: island.center.z,
      radius: island.radius * 1.3,
    };
  }
  return OCEAN_OVERVIEW;
}

/** มินิแมพแบบหลายเกาะ: cache ฉากพื้นหลังแต่ละมุมมอง และวาดผู้เล่นอย่างเดียวทุกเฟรม */
export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private backgrounds = new Map<MinimapView['id'], HTMLCanvasElement>();
  private activeView: MinimapView;
  private size: number;

  constructor(private controller: CharacterController) {
    this.size = isTouchDevice() ? 112 : 144;
    this.activeView = getMinimapView(controller.position.x, controller.position.z);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.canvas.className = 'game-minimap';
    this.canvas.style.cssText = `
      position: fixed; left: 14px; top: 14px; z-index: 15; pointer-events: none;
      width: ${this.size}px; height: ${this.size}px; border-radius: 50%;
      border: 2px solid rgba(255,255,255,.55); box-shadow: 0 2px 10px rgba(0,0,0,.4);
    `;
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.backgrounds.set(this.activeView.id, this.renderBackground(this.activeView));
  }

  private renderBackground(view: MinimapView): HTMLCanvasElement {
    const res = 160;
    const bg = document.createElement('canvas');
    bg.width = res;
    bg.height = res;
    const ctx = bg.getContext('2d')!;
    const img = ctx.createImageData(res, res);
    for (let py = 0; py < res; py++) {
      for (let px = 0; px < res; px++) {
        const wx = view.centerX + ((px / (res - 1)) * 2 - 1) * view.radius;
        const wz = view.centerZ + ((py / (res - 1)) * 2 - 1) * view.radius;
        const h = worldHeightAt(wx, wz);
        const terrainIsland = findIslandAt(wx, wz);
        let color: [number, number, number];
        if (h < WATER_LEVEL - 0.4) color = [23, 74, 105];
        else if (h < WATER_LEVEL + 0.05) color = [46, 110, 148];
        else if (terrainIsland?.id === 'sunscar-desert' && h < 3.5) {
          const t = Math.max(0, Math.min(1, h / 3.5));
          color = [222 - t * 27, 190 - t * 35, 132 - t * 27];
        }
        else if (terrainIsland?.id === 'sunscar-desert') color = [154, 125, 91];
        else if (h < 0.7) color = [222, 205, 158];
        else if (h < 3.4) {
          const t = (h - 0.7) / 2.7;
          color = [96 - t * 25, 148 - t * 30, 74 - t * 18];
        } else color = [124, 132, 121];
        const i = (py * res + px) * 4;
        img.data[i] = color[0];
        img.data[i + 1] = color[1];
        img.data[i + 2] = color[2];
        img.data[i + 3] = 235;
      }
    }
    ctx.putImageData(img, 0, 0);

    const points = view.id === 'ocean-overview'
      ? ALL_WORLD_POI_LIST.filter((poi) => poi.icon === '⚓' || poi.icon === '◆' || poi.icon === '▲')
      : ALL_WORLD_POI_LIST.filter((poi) => poi.islandId === view.id);
    for (const poi of points) {
      const px = (((poi.x - view.centerX) / view.radius) * 0.5 + 0.5) * res;
      const py = (((poi.z - view.centerZ) / view.radius) * 0.5 + 0.5) * res;
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,216,105,.95)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(35,27,15,.85)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#302415';
      ctx.font = 'bold 7px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(poi.icon, px, py + 0.3);
    }
    return bg;
  }

  update(): void {
    const position = this.controller.position;
    const nextView = getMinimapView(position.x, position.z);
    if (nextView.id !== this.activeView.id) {
      this.activeView = nextView;
      if (!this.backgrounds.has(nextView.id)) {
        this.backgrounds.set(nextView.id, this.renderBackground(nextView));
      }
    }

    const { ctx, size, activeView: view } = this;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(this.backgrounds.get(view.id)!, 0, 0, size, size);

    const normalizedX = (position.x - view.centerX) / view.radius;
    const normalizedZ = (position.z - view.centerZ) / view.radius;
    const edgeScale = Math.max(1, Math.hypot(normalizedX, normalizedZ) / 0.9);
    const mx = ((normalizedX / edgeScale) * 0.5 + 0.5) * size;
    const my = ((normalizedZ / edgeScale) * 0.5 + 0.5) * size;
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(Math.PI - this.controller.heading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = 'rgba(255,255,255,.88)';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', size / 2, 13);
    ctx.fillStyle = 'rgba(4,20,27,.72)';
    ctx.fillRect(size * 0.18, size - 19, size * 0.64, 14);
    ctx.fillStyle = '#e9f8ed';
    ctx.font = 'bold 7px sans-serif';
    ctx.fillText(view.label, size / 2, size - 9);
  }
}
