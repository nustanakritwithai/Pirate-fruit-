/** Phase DF1 — Devil Fruit world influence (area cells, not direct overrides) */

export type DevilFruitEffectType =
  | 'fire'
  | 'ice'
  | 'lightning'
  | 'wind'
  | 'darkness'
  | 'light'
  | 'poison'
  | 'earthquake'
  | 'smoke'
  | 'sand';

export interface AreaEffectCell {
  id: string;
  type: DevilFruitEffectType;
  x: number;
  z: number;
  radius: number;
  strength: number;
  durationMs: number;
  remainingMs: number;
  /** 0 = uniform, 1 = linear falloff to edge */
  falloff: number;
  sourceSkillId?: string;
}

export interface SpawnAreaEffectParams {
  type: DevilFruitEffectType;
  x: number;
  z: number;
  radius?: number;
  strength?: number;
  durationMs?: number;
  falloff?: number;
  sourceSkillId?: string;
}

export interface AreaInfluenceSample {
  fire: number;
  ice: number;
  lightning: number;
  wind: number;
  darkness: number;
  light: number;
  poison: number;
  earthquake: number;
  smoke: number;
  sand: number;
  visionFactor: number;
  movementFactor: number;
  cohesionFactor: number;
  alertBias: number;
  fleeBias: number;
}

export interface DevilFruitInfluenceMetrics {
  activeEffects: number;
  byType: Partial<Record<DevilFruitEffectType, number>>;
  lastTickMs: number;
  economyPressuresEmitted: number;
}

export const DEVIL_FRUIT_EFFECT_TYPES: readonly DevilFruitEffectType[] = [
  'fire',
  'ice',
  'lightning',
  'wind',
  'darkness',
  'light',
  'poison',
  'earthquake',
  'smoke',
  'sand',
] as const;

export function emptyAreaInfluence(): AreaInfluenceSample {
  return {
    fire: 0,
    ice: 0,
    lightning: 0,
    wind: 0,
    darkness: 0,
    light: 0,
    poison: 0,
    earthquake: 0,
    smoke: 0,
    sand: 0,
    visionFactor: 1,
    movementFactor: 1,
    cohesionFactor: 1,
    alertBias: 0,
    fleeBias: 0,
  };
}
