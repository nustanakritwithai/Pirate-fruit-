import type { MonsterCell, MonsterThoughtState } from './MonsterCellularTypes';

let cellCounter = 0;

export function resetMonsterCellCounter(): void {
  cellCounter = 0;
}

export function createCellId(): string {
  cellCounter += 1;
  return `mcell-${cellCounter}`;
}

export class MonsterRegistry {
  private readonly cells = new Map<string, MonsterCell>();

  get size(): number {
    return this.cells.size;
  }

  getAll(): MonsterCell[] {
    return [...this.cells.values()];
  }

  get(id: string): MonsterCell | undefined {
    return this.cells.get(id);
  }

  register(cell: MonsterCell): void {
    this.cells.set(cell.id, cell);
  }

  remove(id: string): void {
    this.cells.delete(id);
  }

  clear(): void {
    this.cells.clear();
  }

  countByState(): Record<MonsterThoughtState, number> {
    const counts: Record<MonsterThoughtState, number> = {
      idle: 0,
      alert: 0,
      hunt: 0,
      attack: 0,
      flee: 0,
      regroup: 0,
      rest: 0,
      dead: 0,
    };
    for (const cell of this.cells.values()) {
      counts[cell.currentState] += 1;
    }
    return counts;
  }
}
