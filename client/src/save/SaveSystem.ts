import type { CharacterController } from '../player/CharacterController';
import type { ThirdPersonCamera } from '../camera/ThirdPersonCamera';

const SAVE_KEY = 'pirate-fruit:save-v1';
const AUTOSAVE_INTERVAL = 3; // วินาที

export interface SaveData {
  x: number;
  y: number;
  z: number;
  heading: number;
  cameraYaw: number;
  worldTime?: number;
  spawnId?: string;
}

/**
 * เซฟตำแหน่งผู้เล่นลง localStorage อัตโนมัติ และโหลดคืนตอนเปิดเกม
 * เซฟเฉพาะตอนยืนบนพื้น เพื่อไม่ให้จุดเกิดใหม่ค้างอยู่กลางอากาศ/กลางทะเล
 */
export class SaveSystem {
  private timer = 0;

  constructor(
    private controller: CharacterController,
    private camera: ThirdPersonCamera,
    private getWorldTime: () => number,
    private spawnId = 'starter-village',
  ) {
    window.addEventListener('beforeunload', () => this.save());
  }

  static load(): SaveData | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as SaveData;
      if (typeof data.x !== 'number' || typeof data.z !== 'number') return null;
      return data;
    } catch {
      return null;
    }
  }

  save(): void {
    if (!this.controller.moveState.onGround || this.controller.isMounted) return;
    const p = this.controller.position;
    const data: SaveData = {
      x: p.x,
      y: p.y,
      z: p.z,
      heading: this.controller.heading,
      cameraYaw: this.camera.yaw,
      worldTime: this.getWorldTime(),
      spawnId: this.spawnId,
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      // storage เต็ม/ถูกปิด — ข้ามไป ไม่ให้เกมพัง
    }
  }

  /** จุดเกิดล่าสุดสำหรับ respawn ตอนตกน้ำ */
  lastSpawn(): SaveData | null {
    return SaveSystem.load();
  }

  update(dt: number): void {
    this.timer += dt;
    if (this.timer >= AUTOSAVE_INTERVAL) {
      this.timer = 0;
      this.save();
    }
  }
}
