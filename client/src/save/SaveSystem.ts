import type { CharacterController } from '../player/CharacterController';
import type { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { getIsland, inferIslandId } from '../island/IslandRegistry';
import type { IslandId } from '../island/IslandTypes';

const SAVE_KEY = 'pirate-fruit:save-v1';
const AUTOSAVE_INTERVAL = 3; // วินาที

export interface SaveData {
  saveVersion?: 2 | 3 | 4;
  x: number;
  y: number;
  z: number;
  heading: number;
  cameraYaw: number;
  worldTime?: number;
  spawnId?: string;
  islandId?: IslandId;
  hp?: number;
  energy?: number;
  mp?: number;
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
    private getCheckpoint: () => { spawnId: string; islandId: IslandId } = () => ({
      spawnId: 'starter-village',
      islandId: 'starter-island',
    }),
  ) {
    window.addEventListener('beforeunload', () => this.save());
  }

  static load(): SaveData | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as SaveData;
      if (typeof data.x !== 'number' || typeof data.z !== 'number') return null;
      // Migration v1-v2: ไม่แตะตำแหน่ง/HP เดิม เพียงเติม metadata ของเกาะเพื่อใช้ respawn
      if (!data.islandId) data.islandId = inferIslandId(data.x, data.z);
      if (!data.spawnId) {
        data.spawnId = getIsland(data.islandId).spawn.id;
      }
      return data;
    } catch {
      return null;
    }
  }

  save(): void {
    if (!this.controller.moveState.onGround || this.controller.isMounted) return;
    const p = this.controller.position;
    const checkpoint = this.getCheckpoint();
    const data: SaveData = {
      saveVersion: 4,
      x: p.x,
      y: p.y,
      z: p.z,
      heading: this.controller.heading,
      cameraYaw: this.camera.yaw,
      worldTime: this.getWorldTime(),
      spawnId: checkpoint.spawnId,
      islandId: checkpoint.islandId,
      hp: this.controller.hp,
      energy: this.controller.energy,
      mp: this.controller.mp,
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
