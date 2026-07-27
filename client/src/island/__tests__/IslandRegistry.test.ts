import { describe, expect, it } from 'vitest';
import {
  BOAT_DOCK_OFFSHORE_DIRECTIONS,
  BOAT_DOCK_SPAWNS,
} from '@pirate-fruit/shared';
import {
  DOCKS,
  ISLANDS,
  SPAWN_POINTS,
  SEA_FLOOR_HEIGHT,
  findDockAt,
  getSpawnPoint,
  getIsland,
  azureFrostHeightAt,
  tempestSkyHeightAt,
  emberVolcanoHeightAt,
  mistJungleHeightAt,
  sunscarDesertHeightAt,
  starterHeightAt,
  worldHeightAt,
} from '../IslandRegistry';

function legacyStarterHeightAt(x: number, z: number): number {
  const d = Math.hypot(x, z);
  const t = Math.min(1, Math.max(0, 1 - d / 60));
  const falloff = t * t * (3 - 2 * t);
  const hills =
    Math.sin(x * 0.15) * Math.cos(z * 0.12) * 1.1 +
    Math.sin(x * 0.05 + z * 0.07) * 1.6 +
    Math.cos(x * 0.03 - z * 0.05) * 0.9;
  return falloff * (3.2 + hills) - 0.9;
}

describe('multi-island registry', () => {
  it('has unique island, spawn and dock ids', () => {
    expect(new Set(ISLANDS.map((island) => island.id)).size).toBe(ISLANDS.length);
    expect(new Set(ISLANDS.map((island) => island.spawn.id)).size).toBe(ISLANDS.length);
    expect(new Set(DOCKS.map((dock) => dock.id)).size).toBe(DOCKS.length);
    expect(SPAWN_POINTS).toHaveLength(ISLANDS.length);
    expect(new Set(SPAWN_POINTS.map((spawn) => spawn.id)).size).toBe(SPAWN_POINTS.length);
    for (const spawn of SPAWN_POINTS) {
      expect(getSpawnPoint(spawn.id)?.islandId).toBe(spawn.islandId);
      expect(spawn.safeRadius).toBeGreaterThan(0);
    }
  });

  it('keeps the starter terrain formula exactly compatible with old saves', () => {
    for (const [x, z] of [[0, 0], [17, -9], [-31, 12], [58, 0], [80, 0]]) {
      expect(starterHeightAt(x, z)).toBeCloseTo(legacyStarterHeightAt(x, z), 10);
    }
  });

  it('leaves navigable sea between all island routes', () => {
    expect(worldHeightAt(88, -30)).toBe(SEA_FLOOR_HEIGHT);
    expect(worldHeightAt(115, -105)).toBe(SEA_FLOOR_HEIGHT);
    expect(worldHeightAt(270, -120)).toBe(SEA_FLOOR_HEIGHT);
    expect(worldHeightAt(420, 20)).toBe(SEA_FLOOR_HEIGHT);
    expect(worldHeightAt(470, 220)).toBe(SEA_FLOOR_HEIGHT);
    expect(worldHeightAt(320, 460)).toBe(SEA_FLOOR_HEIGHT);
  });

  it('เรียงเกาะจากง่ายไปยากและเว้นระยะทะเลพอสำหรับเรือ', () => {
    const levels = ISLANDS.map((island) => island.recommendedLevel[0]);
    expect(levels).toEqual([1, 15, 31, 51, 71, 91]);
    for (let i = 1; i < ISLANDS.length; i++) {
      const previous = ISLANDS[i - 1];
      const current = ISLANDS[i];
      expect(Math.hypot(current.center.x - previous.center.x, current.center.z - previous.center.z))
        .toBeGreaterThan(previous.radius + current.radius + 35);
    }
  });

  it('places every checkpoint on dry land', () => {
    for (const island of ISLANDS) {
      expect(worldHeightAt(island.spawn.x, island.spawn.z)).toBeGreaterThan(0.25);
    }
    expect(mistJungleHeightAt(170, -120)).toBeGreaterThan(2.5);
    expect(sunscarDesertHeightAt(360, -40)).toBeGreaterThan(2.5);
    expect(azureFrostHeightAt(500, 110)).toBeGreaterThan(2.5);
    expect(tempestSkyHeightAt(430, 330)).toBeGreaterThan(3);
    expect(emberVolcanoHeightAt(220, 470)).toBeGreaterThan(4);
  });

  it('resolves each dock zone and keeps boat spawns in water', () => {
    for (const dock of DOCKS) {
      expect(findDockAt(dock.boatSpawn.x, dock.boatSpawn.z)?.id).toBe(dock.id);
      expect(worldHeightAt(dock.boatSpawn.x, dock.boatSpawn.z)).toBeLessThan(0.05);
      expect(getIsland(dock.islandId).dockIds).toContain(dock.id);
    }
  });

  it('keeps every authoritative overflow lane in navigable water', () => {
    for (const [islandId, spawn] of Object.entries(BOAT_DOCK_SPAWNS)) {
      const offshore = BOAT_DOCK_OFFSHORE_DIRECTIONS[islandId]!;
      for (const distance of [0, 8, 16, 32, 64, 96]) {
        expect(worldHeightAt(
          spawn.x + offshore.x * distance,
          spawn.z + offshore.z * distance,
        )).toBeLessThan(0.05);
      }
    }
  });
});
