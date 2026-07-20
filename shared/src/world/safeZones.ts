/**
 * Canonical server/client safe-zone contract.
 * Coordinates are current world coordinates (after island layout offsets).
 * Only villages/spawn hubs and harbours are protected; monster camps and boss arenas are not.
 */
export interface WorldSafeZone {
  id: string;
  islandId: string;
  x: number;
  z: number;
  radius: number;
  kind: 'spawn' | 'harbor';
}

export const WORLD_SAFE_ZONES: readonly WorldSafeZone[] = [
  { id: 'starter-village', islandId: 'starter-island', x: 0, z: 8, radius: 18, kind: 'spawn' },
  { id: 'starter-harbor', islandId: 'starter-island', x: 0, z: -31, radius: 10, kind: 'harbor' },
  { id: 'mist-jungle-camp', islandId: 'mist-jungle', x: 153, z: -120, radius: 11, kind: 'spawn' },
  { id: 'mist-jungle-harbor', islandId: 'mist-jungle', x: 137, z: -120, radius: 8, kind: 'harbor' },
  { id: 'sunscar-caravan-city', islandId: 'sunscar-desert', x: 360, z: -65, radius: 12, kind: 'spawn' },
  { id: 'sunscar-desert-harbor', islandId: 'sunscar-desert', x: 360, z: -71, radius: 8, kind: 'harbor' },
  { id: 'azure-frost-village', islandId: 'azure-frost', x: 524, z: 101, radius: 12, kind: 'spawn' },
  { id: 'azure-frost-harbor', islandId: 'azure-frost', x: 531, z: 90, radius: 8, kind: 'harbor' },
  { id: 'tempest-cliff-village', islandId: 'tempest-sky', x: 459, z: 330, radius: 12, kind: 'spawn' },
  { id: 'tempest-sky-harbor', islandId: 'tempest-sky', x: 456, z: 330, radius: 8, kind: 'harbor' },
  { id: 'ember-forge-village', islandId: 'ember-volcano', x: 237, z: 500, radius: 12, kind: 'spawn' },
  { id: 'ember-volcano-harbor', islandId: 'ember-volcano', x: 243, z: 512, radius: 8, kind: 'harbor' },
] as const;

export function worldSafeZoneAt(
  islandId: string | undefined,
  x: number,
  z: number,
): WorldSafeZone | undefined {
  return WORLD_SAFE_ZONES.find((zone) => (
    (!islandId || zone.islandId === islandId)
    && Math.hypot(x - zone.x, z - zone.z) <= zone.radius
  ));
}

export function isWorldSafeZone(islandId: string | undefined, x: number, z: number): boolean {
  return worldSafeZoneAt(islandId, x, z) !== undefined;
}
