import * as THREE from 'three';
import type { DockDefinition, IslandDefinition, IslandId } from './IslandTypes';

export const SEA_FLOOR_HEIGHT = -0.9;
export const STARTER_ISLAND_RADIUS = 60;
export const MIST_JUNGLE_CENTER = { x: 170, z: -40 } as const;
export const MIST_JUNGLE_RADIUS = 54;

/** สูตรพื้นเกาะเดิม ห้ามเปลี่ยน เพื่อให้เซฟและ collider ของ Phase 1-8 ตรงตำแหน่งเดิม */
export function starterHeightAt(x: number, z: number): number {
  const d = Math.hypot(x, z);
  const t = THREE.MathUtils.clamp(1 - d / STARTER_ISLAND_RADIUS, 0, 1);
  const falloff = t * t * (3 - 2 * t);
  const hills =
    Math.sin(x * 0.15) * Math.cos(z * 0.12) * 1.1 +
    Math.sin(x * 0.05 + z * 0.07) * 1.6 +
    Math.cos(x * 0.03 - z * 0.05) * 0.9;
  return falloff * (3.2 + hills) + SEA_FLOOR_HEIGHT;
}

/** พื้นเกาะพงไพรหมอก ใช้พิกัด local เพื่อย้ายเกาะได้โดยไม่ทำให้รูปทรงเปลี่ยน */
export function mistJungleHeightAt(x: number, z: number): number {
  const lx = x - MIST_JUNGLE_CENTER.x;
  const lz = z - MIST_JUNGLE_CENTER.z;
  const d = Math.hypot(lx, lz);
  const t = THREE.MathUtils.clamp(1 - d / MIST_JUNGLE_RADIUS, 0, 1);
  const falloff = t * t * (3 - 2 * t);
  const hills =
    Math.sin(lx * 0.13) * Math.cos(lz * 0.1) * 1.25 +
    Math.sin(lx * 0.055 + lz * 0.075) * 1.5 +
    Math.cos(lx * 0.045 - lz * 0.035) * 0.8;
  return falloff * (4.5 + hills) + SEA_FLOOR_HEIGHT;
}

export const DOCKS: readonly DockDefinition[] = [
  {
    id: 'starter-harbor',
    islandId: 'starter-island',
    name: 'ท่าเรือเกาะเริ่มต้น',
    zone: { minX: -4, maxX: 10, minZ: -61, maxZ: -27 },
    boatSpawn: { x: 4.2, z: -43, heading: Math.PI },
    disembark: { fixedAxis: 'x', fixedValue: 1.85, clampAxis: 'z', min: -58, max: -28.3 },
  },
  {
    id: 'mist-jungle-harbor',
    islandId: 'mist-jungle',
    name: 'ท่าเรือพงไพรหมอก',
    zone: { minX: 108, maxX: 143, minZ: -48, maxZ: -32 },
    boatSpawn: { x: 113, z: -45, heading: Math.PI / 2 },
    disembark: { fixedAxis: 'z', fixedValue: -37.65, clampAxis: 'x', min: 112, max: 141 },
  },
] as const;

export const ISLANDS: readonly IslandDefinition[] = [
  {
    id: 'starter-island',
    name: 'เกาะเริ่มต้น',
    subtitle: 'หมู่บ้านโจรสลัดฝึกหัด',
    center: { x: 0, z: 0 },
    radius: STARTER_ISLAND_RADIUS,
    recommendedLevel: [1, 14],
    spawn: { id: 'starter-village', x: 0, z: 8, heading: Math.PI },
    dockIds: ['starter-harbor'],
    heightAt: starterHeightAt,
  },
  {
    id: 'mist-jungle',
    name: 'เกาะพงไพรหมอก',
    subtitle: 'ป่าดิบชื้นและซากวิหารโบราณ',
    center: MIST_JUNGLE_CENTER,
    radius: MIST_JUNGLE_RADIUS,
    recommendedLevel: [15, 30],
    spawn: { id: 'mist-jungle-camp', x: 153, z: -40, heading: Math.PI / 2 },
    dockIds: ['mist-jungle-harbor'],
    heightAt: mistJungleHeightAt,
  },
] as const;

const ISLAND_BY_ID = new Map(ISLANDS.map((island) => [island.id, island]));
const DOCK_BY_ID = new Map(DOCKS.map((dock) => [dock.id, dock]));

export function getIsland(id: IslandId): IslandDefinition {
  return ISLAND_BY_ID.get(id)!;
}

export function getDock(id: string): DockDefinition | undefined {
  return DOCK_BY_ID.get(id);
}

export function findDockAt(x: number, z: number): DockDefinition | undefined {
  return DOCKS.find((dock) =>
    x >= dock.zone.minX && x <= dock.zone.maxX && z >= dock.zone.minZ && z <= dock.zone.maxZ,
  );
}

export function findIslandAt(x: number, z: number, margin = 0): IslandDefinition | undefined {
  return ISLANDS.find((island) =>
    Math.hypot(x - island.center.x, z - island.center.z) <= island.radius + margin,
  );
}

export function nearestIsland(x: number, z: number): IslandDefinition {
  return ISLANDS.reduce((nearest, island) => {
    const nearestDistance = Math.hypot(x - nearest.center.x, z - nearest.center.z);
    const distance = Math.hypot(x - island.center.x, z - island.center.z);
    return distance < nearestDistance ? island : nearest;
  });
}

/** Composite height provider ของทุกเกาะ ใช้ร่วมกันโดย terrain, collision, monster และเรือ */
export function worldHeightAt(x: number, z: number): number {
  let height = SEA_FLOOR_HEIGHT;
  for (const island of ISLANDS) height = Math.max(height, island.heightAt(x, z));
  return height;
}

export function inferIslandId(x: number, z: number): IslandId {
  return (findIslandAt(x, z, 10) ?? nearestIsland(x, z)).id;
}
