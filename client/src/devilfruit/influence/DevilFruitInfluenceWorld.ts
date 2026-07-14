import { DEVIL_FRUIT_INFLUENCE_CONFIG, defaultForType } from './DevilFruitInfluenceConfig';
import type {
  AreaEffectCell,
  AreaInfluenceSample,
  DevilFruitInfluenceMetrics,
  SpawnAreaEffectParams,
} from './DevilFruitInfluenceTypes';
import { AreaEffectRegistry } from './AreaEffectRegistry';
import { AreaEffectSpatialGrid } from './AreaEffectSpatialGrid';
import {
  rebuildSpatialGrid,
  sampleAreaInfluence,
  tickEffects,
} from './AreaInfluenceResolver';
import {
  createAreaEffect,
  findStackCandidate,
  mergeStackedEffect,
} from './EffectStackRules';

export class DevilFruitInfluenceWorld {
  readonly registry = new AreaEffectRegistry();
  private readonly grid = new AreaEffectSpatialGrid(DEVIL_FRUIT_INFLUENCE_CONFIG.spatialCellSize);
  private latestMetrics: DevilFruitInfluenceMetrics = {
    activeEffects: 0,
    byType: {},
    lastTickMs: 0,
    economyPressuresEmitted: 0,
  };
  debugHeatmapEnabled = false;

  spawnEffect(params: SpawnAreaEffectParams): string {
    const defaults = defaultForType(params.type);
    const existing = findStackCandidate(this.registry.getAll(), params);
    if (existing) {
      const merged = mergeStackedEffect(existing, params, defaults);
      this.registry.register(merged);
      rebuildSpatialGrid(this.registry, this.grid);
      return merged.id;
    }

    if (this.registry.size >= DEVIL_FRUIT_INFLUENCE_CONFIG.maxActiveEffects) {
      const oldest = this.registry.getAll().sort((a, b) => a.remainingMs - b.remainingMs)[0];
      if (oldest) this.registry.remove(oldest.id);
    }

    const effect = createAreaEffect(params, defaults);
    this.registry.register(effect);
    rebuildSpatialGrid(this.registry, this.grid);
    return effect.id;
  }

  influenceUpdate(dtMs: number): void {
    const t0 = performance.now();
    tickEffects(this.registry, dtMs);
    rebuildSpatialGrid(this.registry, this.grid);
    this.latestMetrics = {
      activeEffects: this.registry.size,
      byType: this.registry.countByType(),
      lastTickMs: performance.now() - t0,
      economyPressuresEmitted: this.latestMetrics.economyPressuresEmitted,
    };
  }

  recordEconomyPressures(count: number): void {
    this.latestMetrics = { ...this.latestMetrics, economyPressuresEmitted: count };
  }

  sampleAt(x: number, z: number): AreaInfluenceSample {
    return sampleAreaInfluence(x, z, this.registry, this.grid);
  }

  getEffects(): AreaEffectCell[] {
    return this.registry.getAll();
  }

  get metrics(): DevilFruitInfluenceMetrics {
    return this.latestMetrics;
  }

  clear(): void {
    this.registry.clear();
    this.grid.clear();
  }
}
