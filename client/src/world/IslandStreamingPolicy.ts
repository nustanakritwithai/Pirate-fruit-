/** Terrain and props enter together so the 155–175 m band never shows a bare island. */
export const ISLAND_LOAD_DISTANCE = 155;
export const ISLAND_UNLOAD_DISTANCE = 260;

export type IslandStreamingAction = 'load' | 'unload' | 'keep';

export function islandStreamingAction(
  distance: number,
  loaded: boolean,
  pending: boolean,
): IslandStreamingAction {
  if (distance <= ISLAND_LOAD_DISTANCE && !loaded && !pending) return 'load';
  if (distance > ISLAND_UNLOAD_DISTANCE && loaded) return 'unload';
  return 'keep';
}
