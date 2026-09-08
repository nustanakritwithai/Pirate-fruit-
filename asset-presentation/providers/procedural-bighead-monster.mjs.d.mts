import type { Group } from 'three';
export function createBigheadMonsterProvider(options: Record<string, unknown>): (input?: Record<string, unknown>) => {
  root: Group;
  rig: Record<string, unknown>;
  play(name: string, options?: { duration?: number }): unknown;
  update(dt: number, state?: { moving?: boolean }): unknown;
  anchor(name: string, target?: { x?: number; y?: number; z?: number }): { x: number; y: number; z: number };
  bounds(target?: { minY?: number; maxY?: number }): { minY: number; maxY: number };
  setAppearance(appearance?: unknown): unknown;
  dispose(): void;
};
