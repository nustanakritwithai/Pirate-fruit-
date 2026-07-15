import * as THREE from 'three';
import type { DockDefinition, IslandDefinition, IslandId, IslandPoint } from './IslandTypes';

export const SEA_FLOOR_HEIGHT = -0.9;
export const STARTER_ISLAND_RADIUS = 60;
/** ศูนย์กลางใหม่เรียงตามเส้นทางความยากจากเกาะเริ่มต้นไปสู่เกาะท้ายแผนที่ */
export const MIST_JUNGLE_CENTER = { x: 170, z: -120 } as const;
export const MIST_JUNGLE_RADIUS = 54;
export const SUNSCAR_DESERT_CENTER = { x: 360, z: -40 } as const;
export const SUNSCAR_DESERT_RADIUS = 56;
export const AZURE_FROST_CENTER = { x: 500, z: 110 } as const;
export const AZURE_FROST_RADIUS = 58;
export const TEMPEST_SKY_CENTER = { x: 430, z: 330 } as const;
export const TEMPEST_SKY_RADIUS = 60;
export const EMBER_VOLCANO_CENTER = { x: 220, z: 470 } as const;
export const EMBER_VOLCANO_RADIUS = 62;

/** พิกัดเดิมของรายละเอียดเกาะ — ใช้เป็น local world coordinates ก่อนเลื่อน root */
export const MIST_JUNGLE_LEGACY_CENTER = { x: 170, z: -40 } as const;
export const SUNSCAR_DESERT_LEGACY_CENTER = { x: 170, z: 125 } as const;
export const AZURE_FROST_LEGACY_CENTER = { x: 35, z: 210 } as const;
export const TEMPEST_SKY_LEGACY_CENTER = { x: -125, z: 210 } as const;
export const EMBER_VOLCANO_LEGACY_CENTER = { x: -235, z: 70 } as const;

/** offset จากข้อมูลฉากเดิมไปยังแผนที่ใหม่ (translation อย่างเดียวจึงไม่ทำลายรูปทรงเกาะ) */
export const ISLAND_LAYOUT_OFFSETS = {
  'starter-island': { x: 0, z: 0 },
  'mist-jungle': { x: 0, z: -80 },
  'sunscar-desert': { x: 190, z: -165 },
  'azure-frost': { x: 465, z: -100 },
  'tempest-sky': { x: 555, z: 120 },
  'ember-volcano': { x: 455, z: 400 },
} as const satisfies Record<IslandId, IslandPoint>;

export function layoutOffset(islandId: IslandId): IslandPoint {
  return { ...ISLAND_LAYOUT_OFFSETS[islandId] };
}

/** ย้ายจุดจากพิกัดฉากเดิมไปยังพิกัดแผนที่ปัจจุบัน */
export function layoutPoint(islandId: IslandId, x: number, z: number): IslandPoint {
  const offset = ISLAND_LAYOUT_OFFSETS[islandId];
  return { x: x + offset.x, z: z + offset.z };
}

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

/** พื้นเกาะทะเลทรายสุริยะ เนินทรายเตี้ยล้อม mesa หินทรายตรงกลาง */
export function sunscarDesertHeightAt(x: number, z: number): number {
  const lx = x - SUNSCAR_DESERT_CENTER.x;
  const lz = z - SUNSCAR_DESERT_CENTER.z;
  const d = Math.hypot(lx, lz);
  const t = THREE.MathUtils.clamp(1 - d / SUNSCAR_DESERT_RADIUS, 0, 1);
  const falloff = t * t * (3 - 2 * t);
  const hills =
    Math.sin(lx * 0.11) * Math.cos(lz * 0.09) * 0.75 +
    Math.sin(lx * 0.045 + lz * 0.065) * 1.1 +
    Math.cos(lx * 0.03 - lz * 0.05) * 0.65;
  const duneRipple = Math.sin((lx + lz) * 0.18) * 0.22 * falloff;
  return falloff * (4.2 + hills) + duneRipple + SEA_FLOOR_HEIGHT;
}

/** พื้นเกาะเหมันต์คราม: ชายฝั่งหิมะ ลานน้ำแข็ง และสันเขารอบป้อมเหนือ */
export function azureFrostHeightAt(x: number, z: number): number {
  const lx = x - AZURE_FROST_CENTER.x;
  const lz = z - AZURE_FROST_CENTER.z;
  const d = Math.hypot(lx, lz);
  const t = THREE.MathUtils.clamp(1 - d / AZURE_FROST_RADIUS, 0, 1);
  const falloff = t * t * (3 - 2 * t);
  const ridges =
    Math.sin(lx * 0.105) * Math.cos(lz * 0.082) * 0.9 +
    Math.sin(lx * 0.042 + lz * 0.061) * 1.35 +
    Math.cos(lx * 0.033 - lz * 0.052) * 0.82;
  const northRise = THREE.MathUtils.smoothstep(lz, 8, 38) * 1.25;
  return falloff * (4.35 + ridges + northRise) + SEA_FLOOR_HEIGHT;
}

/** เกาะนภาวายุ: ชายฝั่งหินขาวไล่ขึ้นสู่ที่ราบสูงและวิหารกลางเมฆ */
export function tempestSkyHeightAt(x: number, z: number): number {
  const lx = x - TEMPEST_SKY_CENTER.x;
  const lz = z - TEMPEST_SKY_CENTER.z;
  const d = Math.hypot(lx, lz);
  const t = THREE.MathUtils.clamp(1 - d / TEMPEST_SKY_RADIUS, 0, 1);
  const falloff = t * t * (3 - 2 * t);
  const ridges =
    Math.sin(lx * 0.095) * Math.cos(lz * 0.078) * 1.05 +
    Math.sin(lx * 0.038 + lz * 0.057) * 1.4 +
    Math.cos(lx * 0.03 - lz * 0.046) * 0.9;
  const plateau = THREE.MathUtils.smoothstep(t, 0.42, 0.76) * 1.45;
  return falloff * (5.15 + ridges + plateau) + SEA_FLOOR_HEIGHT;
}

/** เกาะภูผาอัคคี: ชายฝั่งบะซอลต์ไล่ขึ้นสู่สันภูเขาไฟและแอ่งปล่องกลางเกาะ */
export function emberVolcanoHeightAt(x: number, z: number): number {
  const lx = x - EMBER_VOLCANO_CENTER.x;
  const lz = z - EMBER_VOLCANO_CENTER.z;
  const d = Math.hypot(lx, lz);
  const t = THREE.MathUtils.clamp(1 - d / EMBER_VOLCANO_RADIUS, 0, 1);
  const falloff = t * t * (3 - 2 * t);
  const ridges =
    Math.sin(lx * 0.108) * Math.cos(lz * 0.086) * 1.15 +
    Math.sin(lx * 0.047 + lz * 0.063) * 1.42 +
    Math.cos(lx * 0.036 - lz * 0.052) * 0.92;
  const volcanicRise = THREE.MathUtils.smoothstep(t, 0.24, 0.82) * 3.1;
  const craterDip = Math.exp(-(d * d) / (2 * 8.5 * 8.5)) * 2.2;
  return falloff * (4.75 + ridges + volcanicRise - craterDip) + SEA_FLOOR_HEIGHT;
}

const LEGACY_DOCKS: readonly DockDefinition[] = [
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
  {
    id: 'sunscar-desert-harbor',
    islandId: 'sunscar-desert',
    name: 'ท่าเรือทะเลทรายสุริยะ',
    zone: { minX: 160, maxX: 181, minZ: 68, maxZ: 102 },
    boatSpawn: { x: 175, z: 75, heading: 0 },
    disembark: { fixedAxis: 'x', fixedValue: 172.1, clampAxis: 'z', min: 72, max: 99 },
  },
  {
    id: 'azure-frost-harbor',
    islandId: 'azure-frost',
    name: 'ท่าเรือเหมันต์คราม',
    zone: { minX: 50, maxX: 88, minZ: 187, maxZ: 194 },
    boatSpawn: { x: 84, z: 190, heading: -Math.PI / 2 },
    disembark: { fixedAxis: 'z', fixedValue: 190, clampAxis: 'x', min: 53, max: 82 },
  },
  {
    id: 'tempest-sky-harbor',
    islandId: 'tempest-sky',
    name: 'ท่าเรือนภาวายุ',
    zone: { minX: -104, maxX: -68, minZ: 207, maxZ: 214 },
    boatSpawn: { x: -71, z: 210, heading: -Math.PI / 2 },
    disembark: { fixedAxis: 'z', fixedValue: 210, clampAxis: 'x', min: -101, max: -73 },
  },
  {
    id: 'ember-volcano-harbor',
    islandId: 'ember-volcano',
    name: 'ท่าเรือภูผาอัคคี',
    zone: { minX: -217, maxX: -207, minZ: 101, maxZ: 143 },
    boatSpawn: { x: -212, z: 139, heading: Math.PI },
    disembark: { fixedAxis: 'x', fixedValue: -212, clampAxis: 'z', min: 105, max: 136 },
  },
];

function layoutDock(dock: DockDefinition): DockDefinition {
  const offset = ISLAND_LAYOUT_OFFSETS[dock.islandId];
  return {
    ...dock,
    zone: {
      minX: dock.zone.minX + offset.x,
      maxX: dock.zone.maxX + offset.x,
      minZ: dock.zone.minZ + offset.z,
      maxZ: dock.zone.maxZ + offset.z,
    },
    boatSpawn: {
      ...dock.boatSpawn,
      x: dock.boatSpawn.x + offset.x,
      z: dock.boatSpawn.z + offset.z,
    },
    disembark: {
      ...dock.disembark,
      fixedValue: dock.disembark.fixedValue + (dock.disembark.fixedAxis === 'x' ? offset.x : offset.z),
      min: dock.disembark.min + (dock.disembark.clampAxis === 'x' ? offset.x : offset.z),
      max: dock.disembark.max + (dock.disembark.clampAxis === 'x' ? offset.x : offset.z),
    },
  };
}

export const DOCKS: readonly DockDefinition[] = LEGACY_DOCKS.map(layoutDock);

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
    spawn: { id: 'mist-jungle-camp', ...layoutPoint('mist-jungle', 153, -40), heading: Math.PI / 2 },
    dockIds: ['mist-jungle-harbor'],
    heightAt: mistJungleHeightAt,
  },
  {
    id: 'sunscar-desert',
    name: 'เกาะทะเลทรายสุริยะ',
    subtitle: 'นครคาราวานและอารยธรรมใต้ผืนทราย',
    center: SUNSCAR_DESERT_CENTER,
    radius: SUNSCAR_DESERT_RADIUS,
    recommendedLevel: [31, 50],
    spawn: { id: 'sunscar-caravan-city', ...layoutPoint('sunscar-desert', 170, 100), heading: 0 },
    dockIds: ['sunscar-desert-harbor'],
    heightAt: sunscarDesertHeightAt,
  },
  {
    id: 'azure-frost',
    name: 'เกาะเหมันต์คราม',
    subtitle: 'หมู่บ้านนักล่าและป้อมราชันน้ำแข็ง',
    center: AZURE_FROST_CENTER,
    radius: AZURE_FROST_RADIUS,
    recommendedLevel: [51, 70],
    spawn: { id: 'azure-frost-village', ...layoutPoint('azure-frost', 59, 201), heading: -Math.PI / 2 },
    dockIds: ['azure-frost-harbor'],
    heightAt: azureFrostHeightAt,
  },
  {
    id: 'tempest-sky',
    name: 'เกาะนภาวายุ',
    subtitle: 'นครหน้าผาและวิหารพายุเหนือหมู่เมฆ',
    center: TEMPEST_SKY_CENTER,
    radius: TEMPEST_SKY_RADIUS,
    recommendedLevel: [71, 90],
    spawn: { id: 'tempest-cliff-village', ...layoutPoint('tempest-sky', -96, 210), heading: Math.PI / 2 },
    dockIds: ['tempest-sky-harbor'],
    heightAt: tempestSkyHeightAt,
  },
  {
    id: 'ember-volcano',
    name: 'เกาะภูผาอัคคี',
    subtitle: 'นครช่างตีเหล็กและปล่องไททันแมกมา',
    center: EMBER_VOLCANO_CENTER,
    radius: EMBER_VOLCANO_RADIUS,
    recommendedLevel: [91, 110],
    spawn: { id: 'ember-forge-village', ...layoutPoint('ember-volcano', -218, 102), heading: Math.PI },
    dockIds: ['ember-volcano-harbor'],
    heightAt: emberVolcanoHeightAt,
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
