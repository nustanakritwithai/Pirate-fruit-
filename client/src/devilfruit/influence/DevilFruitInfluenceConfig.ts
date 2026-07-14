import type { DevilFruitEffectType } from './DevilFruitInfluenceTypes';

/** DF1 balance — area effect defaults per element */
export const DEVIL_FRUIT_INFLUENCE_CONFIG = {
  spatialCellSize: 8,
  maxActiveEffects: 120,
  defaultFalloff: 0.65,
  defaultDurationMs: 6000,

  fire: { radius: 7, strength: 2.2, durationMs: 8000 },
  ice: { radius: 6, strength: 1.8, durationMs: 7000 },
  lightning: { radius: 5, strength: 2.5, durationMs: 2500 },
  wind: { radius: 8, strength: 1.4, durationMs: 5000 },
  darkness: { radius: 6, strength: 1.6, durationMs: 6000 },
  light: { radius: 7, strength: 1.5, durationMs: 5000 },
  poison: { radius: 5.5, strength: 2, durationMs: 9000 },
  earthquake: { radius: 10, strength: 2.4, durationMs: 4000 },
  smoke: { radius: 9, strength: 2.1, durationMs: 7000 },
  sand: { radius: 7, strength: 1.7, durationMs: 6000 },

  /** Stack */
  stackStrengthCap: 4,
  stackRefreshBlend: 0.55,

  /** Monster thresholds */
  fireFleeThreshold: 1.5,
  fireAlertBoost: 0.8,
  poisonFleeThreshold: 1.2,
  smokeVisionMin: 0.35,
  iceMoveMin: 0.45,
  earthquakeCohesionMin: 0.3,
  lightningStunTicks: 1,

  /** Economy pressure strengths */
  fireWoodPressure: -0.12,
  smokeProductivityPressure: -0.08,
  earthquakeFactoryPressure: -0.1,

  /** Debug */
  heatmapGridStep: 4,
} as const;

export const EFFECT_COLORS: Record<DevilFruitEffectType, string> = {
  fire: '#ff5722',
  ice: '#4fc3f7',
  lightning: '#ffeb3b',
  wind: '#81c784',
  darkness: '#5c4d7a',
  light: '#fff9c4',
  poison: '#8bc34a',
  earthquake: '#8d6e63',
  smoke: '#9e9e9e',
  sand: '#d7ccc8',
};

export function defaultForType(type: DevilFruitEffectType): {
  radius: number;
  strength: number;
  durationMs: number;
} {
  return DEVIL_FRUIT_INFLUENCE_CONFIG[type];
}
