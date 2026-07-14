import type { AreaEffectCell } from './DevilFruitInfluenceTypes';

let effectCounter = 0;

export function resetAreaEffectCounter(): void {
  effectCounter = 0;
}

export function createAreaEffectId(): string {
  effectCounter += 1;
  return `dfruit-area-${effectCounter}`;
}

export class AreaEffectRegistry {
  private readonly effects = new Map<string, AreaEffectCell>();

  get size(): number {
    return this.effects.size;
  }

  getAll(): AreaEffectCell[] {
    return [...this.effects.values()];
  }

  get(id: string): AreaEffectCell | undefined {
    return this.effects.get(id);
  }

  register(effect: AreaEffectCell): void {
    this.effects.set(effect.id, effect);
  }

  remove(id: string): void {
    this.effects.delete(id);
  }

  clear(): void {
    this.effects.clear();
  }

  countByType(): Partial<Record<AreaEffectCell['type'], number>> {
    const counts: Partial<Record<AreaEffectCell['type'], number>> = {};
    for (const e of this.effects.values()) {
      counts[e.type] = (counts[e.type] ?? 0) + 1;
    }
    return counts;
  }
}
