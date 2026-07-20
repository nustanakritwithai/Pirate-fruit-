import * as THREE from 'three';

/** สิ่งกีดขวางทรงกระบอกแนวตั้ง (ต้นไม้ หิน ลัง ฯลฯ) */
export interface CircleCollider {
  x: number;
  z: number;
  radius: number;
  minY: number;
  maxY: number;
}

/** พื้นสี่เหลี่ยมแนวราบ เช่น สะพานและท่าเรือ */
export interface PlatformCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y: number;
}

const PLAYER_RADIUS = 0.45;
const PLAYER_HEIGHT = 1.8;

/** พื้นเคลื่อนที่ได้ (เช่น ดาดฟ้าเรือ) — คืนความสูงพื้น ณ จุดนั้น หรือ null ถ้าอยู่นอกพื้น */
export type DynamicGroundProvider = (x: number, z: number) => number | null;

/**
 * ระบบชนของ Phase 1
 * - พื้น: ใช้ฟังก์ชันความสูงของเกาะ (heightAt) เช็คได้ตรงๆ ไม่ต้องยิง ray
 * - สิ่งกีดขวาง: ทรงกระบอกแนวตั้ง ดันผู้เล่นออกในแนวราบ
 * - พื้นเคลื่อนที่: provider แบบถอดเข้า-ออกได้ (ดาดฟ้าเรือขณะแล่น)
 */
export class CollisionSystem {
  private colliders: Array<{ value: CircleCollider; scope: string | null }> = [];
  private platforms: Array<{ value: PlatformCollider; scope: string | null }> = [];
  private dynamicGrounds: DynamicGroundProvider[] = [];
  private activeScope: string | null = null;

  constructor(private readonly terrainHeightAt: (x: number, z: number) => number) {}

  addCollider(c: CircleCollider): void {
    this.colliders.push({ value: c, scope: this.activeScope });
  }

  addPlatform(platform: PlatformCollider): void {
    this.platforms.push({ value: platform, scope: this.activeScope });
  }

  /** Group static colliders created by a streamed island so they can be removed together. */
  runInScope<T>(scope: string, build: () => T): T {
    const previous = this.activeScope;
    this.activeScope = scope;
    try {
      return build();
    } finally {
      this.activeScope = previous;
    }
  }

  removeScope(scope: string): void {
    this.colliders = this.colliders.filter((entry) => entry.scope !== scope);
    this.platforms = this.platforms.filter((entry) => entry.scope !== scope);
  }

  addDynamicGround(provider: DynamicGroundProvider): void {
    if (!this.dynamicGrounds.includes(provider)) this.dynamicGrounds.push(provider);
  }

  removeDynamicGround(provider: DynamicGroundProvider): void {
    const index = this.dynamicGrounds.indexOf(provider);
    if (index >= 0) this.dynamicGrounds.splice(index, 1);
  }

  /** คืนพื้นสูงสุด ณ จุดนั้น รวมพื้นเกาะ สิ่งปลูกสร้าง และพื้นเคลื่อนที่ (ดาดฟ้าเรือ) */
  heightAt(x: number, z: number): number {
    let height = this.terrainHeightAt(x, z);
    for (const entry of this.platforms) {
      const platform = entry.value;
      if (
        x >= platform.minX &&
        x <= platform.maxX &&
        z >= platform.minZ &&
        z <= platform.maxZ
      ) {
        height = Math.max(height, platform.y);
      }
    }
    for (const provider of this.dynamicGrounds) {
      const value = provider(x, z);
      if (value !== null) height = Math.max(height, value);
    }
    return height;
  }

  /** ดันตำแหน่งผู้เล่นออกจากสิ่งกีดขวางทั้งหมด (แก้ไข position ตรงๆ) */
  resolveObstacles(position: THREE.Vector3): void {
    for (const entry of this.colliders) {
      const c = entry.value;
      // ไม่ชนถ้าอยู่คนละช่วงความสูง (เช่นกระโดดข้ามหินเตี้ยๆ)
      if (position.y >= c.maxY || position.y + PLAYER_HEIGHT <= c.minY) continue;

      const dx = position.x - c.x;
      const dz = position.z - c.z;
      const dist = Math.hypot(dx, dz);
      const minDist = c.radius + PLAYER_RADIUS;
      if (dist < minDist) {
        if (dist < 1e-5) {
          // อยู่กลางสิ่งกีดขวางพอดี ดันไปทาง +x
          position.x = c.x + minDist;
        } else {
          const push = (minDist - dist) / dist;
          position.x += dx * push;
          position.z += dz * push;
        }
      }
    }
  }
}
