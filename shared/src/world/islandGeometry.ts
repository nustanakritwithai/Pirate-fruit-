export interface IslandGeometry { id: string; center: { x: number; z: number }; radius: number; }

/** Pure geometry shared by IslandManager and server authority; no Three.js dependency. */
export const ISLAND_GEOMETRY: readonly IslandGeometry[] = Object.freeze([
  { id: 'starter-island', center: { x: 0, z: 0 }, radius: 60 },
  { id: 'mist-jungle', center: { x: 170, z: -120 }, radius: 54 },
  { id: 'sunscar-desert', center: { x: 360, z: -40 }, radius: 56 },
  { id: 'azure-frost', center: { x: 500, z: 110 }, radius: 58 },
  { id: 'tempest-sky', center: { x: 430, z: 330 }, radius: 60 },
  { id: 'ember-volcano', center: { x: 220, z: 470 }, radius: 62 },
]);

export function findIslandIdAt(x: number, z: number, margin = 0): string | undefined {
  return ISLAND_GEOMETRY.find((island) => Math.hypot(x - island.center.x, z - island.center.z) <= island.radius + margin)?.id;
}

export function inferIslandId(x: number, z: number): string {
  return findIslandIdAt(x, z, 10) ?? ISLAND_GEOMETRY.reduce((nearest, island) =>
    Math.hypot(x - island.center.x, z - island.center.z) < Math.hypot(x - nearest.center.x, z - nearest.center.z) ? island : nearest,
  ).id;
}
