import * as THREE from 'three';

/** สิ่งกีดขวางทรงกระบอกแนวตั้ง (ต้นไม้ หิน ลัง ฯลฯ) */
export interface CircleCollider {
  x: number;
  z: number;
  radius: number;
  minY: number;
  maxY: number;
}

const PLAYER_RADIUS = 0.45;
const PLAYER_HEIGHT = 1.8;

/**
 * ระบบชนของ Phase 1
 * - พื้น: ใช้ฟังก์ชันความสูงของเกาะ (heightAt) เช็คได้ตรงๆ ไม่ต้องยิง ray
 * - สิ่งกีดขวาง: ทรงกระบอกแนวตั้ง ดันผู้เล่นออกในแนวราบ
 */
export class CollisionSystem {
  private colliders: CircleCollider[] = [];

  constructor(readonly heightAt: (x: number, z: number) => number) {}

  addCollider(c: CircleCollider): void {
    this.colliders.push(c);
  }

  /** ดันตำแหน่งผู้เล่นออกจากสิ่งกีดขวางทั้งหมด (แก้ไข position ตรงๆ) */
  resolveObstacles(position: THREE.Vector3): void {
    for (const c of this.colliders) {
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
