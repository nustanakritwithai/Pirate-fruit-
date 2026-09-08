declare module '../../../asset-presentation/providers/procedural-bighead-monster.mjs' {
  export function createBigheadMonsterProvider(options: Record<string, unknown>): (input?: Record<string, unknown>) => {
    root: import('three').Group;
    play(name: string, options?: { duration?: number }): unknown;
    update(dt: number, state?: { moving?: boolean }): unknown;
    dispose(): void;
  };
}
declare module '../../../asset-presentation/owned-monster-catalog.mjs' {
  export const OWNED_MONSTER_ASSETS: ReadonlyMap<string, {
    id: string; form: string; speciesId: string; type: string; color: number;
    metrics?: { scale?: number; silhouette?: string };
  }>;
}

// TypeScript's bundler resolver does not probe declarations outside the TS root
// for relative .mjs imports; keep the two copied presentation modules typed here.
declare module '*.mjs' {
  export const createBigheadMonsterProvider: any;
  export const OWNED_MONSTER_ASSETS: any;
}
