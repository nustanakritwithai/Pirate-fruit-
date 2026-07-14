import { DEVIL_FRUIT_INFLUENCE_CONFIG } from './DevilFruitInfluenceConfig';
import type {
  AreaEffectCell,
  AreaInfluenceSample,
} from './DevilFruitInfluenceTypes';
import { emptyAreaInfluence } from './DevilFruitInfluenceTypes';
import type { AreaEffectRegistry } from './AreaEffectRegistry';
import type { AreaEffectSpatialGrid } from './AreaEffectSpatialGrid';
import { strengthAt } from './EffectStackRules';

export function sampleAreaInfluence(
  x: number,
  z: number,
  registry: AreaEffectRegistry,
  grid: AreaEffectSpatialGrid,
  queryRadius = 14,
): AreaInfluenceSample {
  const sample = emptyAreaInfluence();
  const ids = grid.queryNearby(x, z, queryRadius);
  for (const id of ids) {
    const effect = registry.get(id);
    if (!effect) continue;
    const s = strengthAt(effect, x, z);
    if (s <= 0) continue;
    sample[effect.type] += s;
  }

  if (sample.smoke > 0) {
    sample.visionFactor = Math.max(
      DEVIL_FRUIT_INFLUENCE_CONFIG.smokeVisionMin,
      1 - sample.smoke * 0.18,
    );
  }
  if (sample.ice > 0) {
    sample.movementFactor = Math.max(
      DEVIL_FRUIT_INFLUENCE_CONFIG.iceMoveMin,
      1 - sample.ice * 0.22,
    );
  }
  if (sample.earthquake > 0) {
    sample.cohesionFactor = Math.max(
      DEVIL_FRUIT_INFLUENCE_CONFIG.earthquakeCohesionMin,
      1 - sample.earthquake * 0.25,
    );
  }
  if (sample.fire > 0) {
    sample.alertBias += sample.fire * DEVIL_FRUIT_INFLUENCE_CONFIG.fireAlertBoost;
    if (sample.fire >= DEVIL_FRUIT_INFLUENCE_CONFIG.fireFleeThreshold) {
      sample.fleeBias += sample.fire * 0.35;
    }
  }
  if (sample.poison >= DEVIL_FRUIT_INFLUENCE_CONFIG.poisonFleeThreshold) {
    sample.fleeBias += sample.poison * 0.4;
  }
  if (sample.lightning > 1) {
    sample.fleeBias += sample.lightning * 0.15;
  }

  return sample;
}

export function applyAreaToNeighborInfluence(
  snapshot: import('../../monster/cellular/MonsterCellularTypes').NeighborSnapshot,
  area: AreaInfluenceSample,
): void {
  const vf = area.visionFactor;
  snapshot.alertInfluence = snapshot.alertInfluence * vf + area.alertBias;
  snapshot.huntInfluence *= vf;
  snapshot.attackInfluence *= vf;
  snapshot.regroupInfluence *= area.cohesionFactor;
  snapshot.fleeInfluence += area.fleeBias;
  snapshot.fireInfluence = area.fire;
  snapshot.iceInfluence = area.ice;
  snapshot.lightningInfluence = area.lightning;
  snapshot.smokeDensity = area.smoke;
  snapshot.poisonInfluence = area.poison;
  snapshot.earthquakeInfluence = area.earthquake;
  snapshot.areaMovementFactor = area.movementFactor;
  snapshot.areaCohesionFactor = area.cohesionFactor;
  snapshot.areaVisionFactor = area.visionFactor;
}

export function lightningStunActive(
  area: AreaInfluenceSample,
): boolean {
  return area.lightning >= DEVIL_FRUIT_INFLUENCE_CONFIG.lightning.strength * 0.55;
}

export function rebuildSpatialGrid(
  registry: AreaEffectRegistry,
  grid: AreaEffectSpatialGrid,
): void {
  grid.clear();
  for (const effect of registry.getAll()) {
    grid.insert(effect);
  }
}

export function tickEffects(
  registry: AreaEffectRegistry,
  dtMs: number,
): number {
  let removed = 0;
  for (const effect of registry.getAll()) {
    effect.remainingMs -= dtMs;
    if (effect.remainingMs <= 0) {
      registry.remove(effect.id);
      removed += 1;
    }
  }
  return removed;
}

export function listEffectsInBounds(
  registry: AreaEffectRegistry,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): AreaEffectCell[] {
  return registry.getAll().filter(
    (e) => e.x >= minX && e.x <= maxX && e.z >= minZ && e.z <= maxZ,
  );
}
