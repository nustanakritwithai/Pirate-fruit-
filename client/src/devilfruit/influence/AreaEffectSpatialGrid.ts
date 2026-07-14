import type { AreaEffectCell } from './DevilFruitInfluenceTypes';

/** Spatial hash for area effect cells — O(local) queries */
export class AreaEffectSpatialGrid {
  private readonly buckets = new Map<string, string[]>();
  private readonly cellSize: number;

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  clear(): void {
    this.buckets.clear();
  }

  private key(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  private bucketCoords(x: number, z: number): [number, number] {
    return [Math.floor(x / this.cellSize), Math.floor(z / this.cellSize)];
  }

  insert(effect: AreaEffectCell): void {
    const [cx, cz] = this.bucketCoords(effect.x, effect.z);
    const span = Math.ceil(effect.radius / this.cellSize);
    for (let dx = -span; dx <= span; dx += 1) {
      for (let dz = -span; dz <= span; dz += 1) {
        const k = this.key(cx + dx, cz + dz);
        const list = this.buckets.get(k) ?? [];
        if (!list.includes(effect.id)) list.push(effect.id);
        this.buckets.set(k, list);
      }
    }
  }

  queryNearby(x: number, z: number, radius: number): string[] {
    const [cx, cz] = this.bucketCoords(x, z);
    const span = Math.ceil(radius / this.cellSize) + 1;
    const out = new Set<string>();
    for (let dx = -span; dx <= span; dx += 1) {
      for (let dz = -span; dz <= span; dz += 1) {
        for (const id of this.buckets.get(this.key(cx + dx, cz + dz)) ?? []) {
          out.add(id);
        }
      }
    }
    return [...out];
  }
}
