export type IslandId =
  | 'starter-island'
  | 'mist-jungle'
  | 'sunscar-desert'
  | 'azure-frost'
  | 'tempest-sky';

export interface IslandPoint {
  x: number;
  z: number;
}

export interface IslandSpawn extends IslandPoint {
  id: string;
  heading: number;
}

export interface DockZone {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface DockDisembark {
  fixedAxis: 'x' | 'z';
  fixedValue: number;
  clampAxis: 'x' | 'z';
  min: number;
  max: number;
}

export interface DockDefinition {
  id: string;
  islandId: IslandId;
  name: string;
  zone: DockZone;
  boatSpawn: IslandPoint & { heading: number };
  disembark: DockDisembark;
}

export interface IslandDefinition {
  id: IslandId;
  name: string;
  subtitle: string;
  center: IslandPoint;
  radius: number;
  recommendedLevel: readonly [number, number];
  spawn: IslandSpawn;
  dockIds: readonly string[];
  heightAt(x: number, z: number): number;
}
