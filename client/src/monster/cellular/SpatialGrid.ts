import type { MonsterCell } from './MonsterCellularTypes';

export class SpatialGrid {
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

  private cellCoord(v: number): number {
    return Math.floor(v / this.cellSize);
  }

  insert(cell: MonsterCell): void {
    const cx = this.cellCoord(cell.position.x);
    const cz = this.cellCoord(cell.position.z);
    const k = this.key(cx, cz);
    const bucket = this.buckets.get(k);
    if (bucket) bucket.push(cell.id);
    else this.buckets.set(k, [cell.id]);
  }

  /** Candidate neighbor ids from surrounding buckets (includes self bucket). */
  queryNearby(x: number, z: number, radius: number): string[] {
    const minCx = this.cellCoord(x - radius);
    const maxCx = this.cellCoord(x + radius);
    const minCz = this.cellCoord(z - radius);
    const maxCz = this.cellCoord(z + radius);
    const found: string[] = [];
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) {
        const bucket = this.buckets.get(this.key(cx, cz));
        if (bucket) found.push(...bucket);
      }
    }
    return found;
  }
}
