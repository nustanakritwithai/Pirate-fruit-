import { DEVIL_FRUIT_INFLUENCE_CONFIG } from './DevilFruitInfluenceConfig';
import type { AreaEffectCell, SpawnAreaEffectParams } from './DevilFruitInfluenceTypes';
import { createAreaEffectId } from './AreaEffectRegistry';

function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

/** Weighted strength at point with linear falloff */
export function strengthAt(
  effect: AreaEffectCell,
  x: number,
  z: number,
): number {
  const d = dist(effect.x, effect.z, x, z);
  if (d > effect.radius) return 0;
  const edge = 1 - d / Math.max(0.001, effect.radius);
  const fall = effect.falloff <= 0 ? 1 : effect.falloff * edge + (1 - effect.falloff);
  return effect.strength * fall * (effect.remainingMs / Math.max(1, effect.durationMs));
}

/** Stack: merge same-type overlaps — refresh duration, cap weighted strength */
export function mergeStackedEffect(
  existing: AreaEffectCell,
  incoming: SpawnAreaEffectParams,
  defaults: { radius: number; strength: number; durationMs: number },
): AreaEffectCell {
  const radius = Math.max(existing.radius, incoming.radius ?? defaults.radius);
  const blended = Math.min(
    DEVIL_FRUIT_INFLUENCE_CONFIG.stackStrengthCap,
    existing.strength + (incoming.strength ?? defaults.strength) * DEVIL_FRUIT_INFLUENCE_CONFIG.stackRefreshBlend,
  );
  const durationMs = incoming.durationMs ?? defaults.durationMs;
  return {
    ...existing,
    radius,
    strength: blended,
    durationMs: Math.max(existing.durationMs, durationMs),
    remainingMs: Math.max(
      existing.remainingMs,
      durationMs * DEVIL_FRUIT_INFLUENCE_CONFIG.stackRefreshBlend,
    ),
    falloff: incoming.falloff ?? existing.falloff,
    sourceSkillId: incoming.sourceSkillId ?? existing.sourceSkillId,
  };
}

export function createAreaEffect(
  params: SpawnAreaEffectParams,
  defaults: { radius: number; strength: number; durationMs: number },
): AreaEffectCell {
  return {
    id: createAreaEffectId(),
    type: params.type,
    x: params.x,
    z: params.z,
    radius: params.radius ?? defaults.radius,
    strength: params.strength ?? defaults.strength,
    durationMs: params.durationMs ?? defaults.durationMs,
    remainingMs: params.durationMs ?? defaults.durationMs,
    falloff: params.falloff ?? DEVIL_FRUIT_INFLUENCE_CONFIG.defaultFalloff,
    sourceSkillId: params.sourceSkillId,
  };
}

export function findStackCandidate(
  effects: AreaEffectCell[],
  params: SpawnAreaEffectParams,
): AreaEffectCell | undefined {
  const mergeRadius = (params.radius ?? DEVIL_FRUIT_INFLUENCE_CONFIG[params.type].radius) * 0.45;
  for (const e of effects) {
    if (e.type !== params.type) continue;
    if (dist(e.x, e.z, params.x, params.z) <= mergeRadius) return e;
  }
  return undefined;
}
