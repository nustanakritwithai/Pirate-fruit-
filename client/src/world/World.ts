import * as THREE from 'three';
import { CollisionSystem } from './Collision';
import { scatterProps } from './props';

export const ISLAND_RADIUS = 60;
export const WATER_LEVEL = 0;

/**
 * ความสูงของพื้นเกาะที่จุด (x, z) — เป็นสูตรล้วนๆ จึงใช้ร่วมกัน
 * ระหว่างการสร้าง mesh และการเช็คชนพื้นได้โดยไม่ต้องยิง ray
 */
export function heightAt(x: number, z: number): number {
  const d = Math.hypot(x, z);
  const t = THREE.MathUtils.clamp(1 - d / ISLAND_RADIUS, 0, 1);
  const falloff = t * t * (3 - 2 * t); // smoothstep: 1 กลางเกาะ → 0 ที่ขอบ
  const hills =
    Math.sin(x * 0.15) * Math.cos(z * 0.12) * 1.1 +
    Math.sin(x * 0.05 + z * 0.07) * 1.6 +
    Math.cos(x * 0.03 - z * 0.05) * 0.9;
  // ขอบเกาะลาดจมลงใต้น้ำเล็กน้อยให้เกิดหาดทราย
  return falloff * (3.2 + hills) - 0.9;
}

/**
 * โลกของ Phase 1: เกาะเริ่มต้นกลางทะเล + แสง + ท้องฟ้า + สิ่งกีดขวาง
 */
export class World {
  readonly collision: CollisionSystem;

  constructor(scene: THREE.Scene) {
    this.collision = new CollisionSystem(heightAt);

    // ---------- ท้องฟ้า + หมอก ----------
    const skyColor = new THREE.Color(0x7ec8f0);
    scene.background = skyColor;
    scene.fog = new THREE.Fog(skyColor, 90, 400);

    // ---------- แสง ----------
    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x3f6b4f, 0.9);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff2d9, 2.2);
    sun.position.set(60, 90, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -80;
    sun.shadow.camera.right = 80;
    sun.shadow.camera.top = 80;
    sun.shadow.camera.bottom = -80;
    sun.shadow.camera.far = 250;
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    // ---------- พื้นเกาะ ----------
    scene.add(this.buildTerrain());

    // ---------- ทะเล ----------
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(1200, 1200),
      new THREE.MeshStandardMaterial({
        color: 0x1e6fa8,
        roughness: 0.35,
        metalness: 0.1,
        transparent: true,
        opacity: 0.92,
      }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = WATER_LEVEL;
    scene.add(water);

    // ---------- ต้นไม้ หิน ลัง ----------
    scatterProps(scene, this.collision, heightAt, ISLAND_RADIUS);
  }

  private buildTerrain(): THREE.Mesh {
    const size = ISLAND_RADIUS * 2.4;
    const segments = 140;
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const sand = new THREE.Color(0xe6d29a);
    const grass = new THREE.Color(0x4f9e4a);
    const rockCol = new THREE.Color(0x8d8f8a);
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = heightAt(x, z);
      pos.setY(i, y);

      // ไล่สีตามความสูง: ทราย → หญ้า → หิน
      if (y < 0.6) {
        tmp.copy(sand);
      } else if (y < 1.2) {
        tmp.copy(sand).lerp(grass, (y - 0.6) / 0.6);
      } else if (y < 3.5) {
        tmp.copy(grass);
      } else {
        tmp.copy(grass).lerp(rockCol, Math.min((y - 3.5) / 1.5, 1));
      }
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const terrain = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    );
    terrain.receiveShadow = true;
    return terrain;
  }
}
