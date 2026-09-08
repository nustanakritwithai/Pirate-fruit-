export const OWNED_MONSTER_ASSETS: ReadonlyMap<string, {
  id: string; form: string; speciesId: string; type: string; color: number;
  metrics?: { scale?: number; silhouette?: string };
}>;
