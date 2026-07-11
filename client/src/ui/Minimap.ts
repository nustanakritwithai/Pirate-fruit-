import type { CharacterController } from '../player/CharacterController';
import { heightAt, WATER_LEVEL } from '../world/World';
import { isTouchDevice } from '../engine/device';
import { WORLD_POI_LIST } from '../world/WorldPOI';

/** รัศมีโลก (เมตร) ที่มินิแมพครอบคลุมจากกึ่งกลางเกาะ */
const MAP_WORLD_RADIUS = 78;

/**
 * มินิแมพวงกลมมุมซ้ายบน: พื้นเกาะวาดล่วงหน้าครั้งเดียวจากสูตร heightAt
 * ทุกเฟรมวาดทับแค่ลูกศรผู้เล่น (ชี้ตามทิศที่หัน) — ต้นทุนแทบเป็นศูนย์
 */
export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private background: HTMLCanvasElement;
  private size: number;

  constructor(private controller: CharacterController) {
    this.size = isTouchDevice() ? 112 : 144;

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.canvas.style.cssText = `
      position: fixed; left: 14px; top: 14px; z-index: 15; pointer-events: none;
      width: ${this.size}px; height: ${this.size}px; border-radius: 50%;
      border: 2px solid rgba(255,255,255,.55); box-shadow: 0 2px 10px rgba(0,0,0,.4);
    `;
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;

    this.background = this.renderBackground();
  }

  /** วาดภาพเกาะมุมสูงจากสูตรความสูง (ทำครั้งเดียวตอนสร้าง) */
  private renderBackground(): HTMLCanvasElement {
    const res = 160;
    const bg = document.createElement('canvas');
    bg.width = res;
    bg.height = res;
    const ctx = bg.getContext('2d')!;
    const img = ctx.createImageData(res, res);

    for (let py = 0; py < res; py++) {
      for (let px = 0; px < res; px++) {
        const wx = ((px / (res - 1)) * 2 - 1) * MAP_WORLD_RADIUS;
        const wz = ((py / (res - 1)) * 2 - 1) * MAP_WORLD_RADIUS;
        const h = heightAt(wx, wz);

        let r: number, g: number, b: number;
        if (h < WATER_LEVEL - 0.4) {
          [r, g, b] = [23, 74, 105]; // ทะเลลึก
        } else if (h < WATER_LEVEL + 0.05) {
          [r, g, b] = [46, 110, 148]; // น้ำตื้นริมหาด
        } else if (h < 0.7) {
          [r, g, b] = [222, 205, 158]; // ทราย
        } else if (h < 3.4) {
          // หญ้า ไล่เข้มขึ้นตามความสูง
          const t = (h - 0.7) / 2.7;
          [r, g, b] = [96 - t * 25, 148 - t * 30, 74 - t * 18];
        } else {
          [r, g, b] = [138, 138, 132]; // ยอดหิน
        }
        const i = (py * res + px) * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = 235;
      }
    }
    ctx.putImageData(img, 0, 0);

    // จุดสำคัญของเกาะ วาดลงพื้นหลังครั้งเดียว
    for (const poi of WORLD_POI_LIST) {
      const px = ((poi.x / MAP_WORLD_RADIUS) * 0.5 + 0.5) * res;
      const py = ((poi.z / MAP_WORLD_RADIUS) * 0.5 + 0.5) * res;
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
    const { ctx, size } = this;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(this.background, 0, 0, size, size);

    // แปลงพิกัดโลก → พิกัดมินิแมพ
    const p = this.controller.position;
    const mx = ((p.x / MAP_WORLD_RADIUS) * 0.5 + 0.5) * size;
    const my = ((p.z / MAP_WORLD_RADIUS) * 0.5 + 0.5) * size;

    // ลูกศรผู้เล่นชี้ตามทิศที่หัน (heading 0 = +Z = ลงล่างของแมพ)
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

    // ตัว N บอกทิศเหนือ (-Z)
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', size / 2, 13);
  }
}
