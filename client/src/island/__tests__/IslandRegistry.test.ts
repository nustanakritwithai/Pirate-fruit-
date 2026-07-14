import { describe, expect, it } from 'vitest';
import {
  DOCKS,
  ISLANDS,
  SEA_FLOOR_HEIGHT,
  findDockAt,
  getIsland,
  azureFrostHeightAt,
  tempestSkyHeightAt,
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
  });

  it('keeps the starter terrain formula exactly compatible with old saves', () => {
    for (const [x, z] of [[0, 0], [17, -9], [-31, 12], [58, 0], [80, 0]]) {
      expect(starterHeightAt(x, z)).toBeCloseTo(legacyStarterHeightAt(x, z), 10);
    }
  });

  it('leaves navigable sea between all island routes', () => {
    expect(worldHeightAt(88, -30)).toBe(SEA_FLOOR_HEIGHT);
    expect(worldHeightAt(98, -40)).toBe(SEA_FLOOR_HEIGHT);
    expect(worldHeightAt(170, 43)).toBe(SEA_FLOOR_HEIGHT);
    expect(worldHeightAt(110, 168)).toBe(SEA_FLOOR_HEIGHT);
    expect(worldHeightAt(-45, 210)).toBe(SEA_FLOOR_HEIGHT);
  });

  it('places every checkpoint on dry land', () => {
    for (const island of ISLANDS) {
      expect(worldHeightAt(island.spawn.x, island.spawn.z)).toBeGreaterThan(0.25);
    }
    expect(mistJungleHeightAt(170, -40)).toBeGreaterThan(2.5);
    expect(sunscarDesertHeightAt(170, 125)).toBeGreaterThan(2.5);
    expect(azureFrostHeightAt(35, 210)).toBeGreaterThan(2.5);
    expect(tempestSkyHeightAt(-125, 210)).toBeGreaterThan(3);
  });

  it('resolves each dock zone and keeps boat spawns in water', () => {
    for (const dock of DOCKS) {
      expect(findDockAt(dock.boatSpawn.x, dock.boatSpawn.z)?.id).toBe(dock.id);
      expect(worldHeightAt(dock.boatSpawn.x, dock.boatSpawn.z)).toBeLessThan(0.05);
      expect(getIsland(dock.islandId).dockIds).toContain(dock.id);
    }
  });
});
