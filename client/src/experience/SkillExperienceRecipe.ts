import type { CastableSkill, SkillRenderType } from '../combat/SkillCasting';
import type {
  SkillExperiencePhaseWindow,
  SkillExperienceRecipe,
  SkillImpactEnvelope,
  SkillMotionGrammar,
  SkillPowerTier,
} from './SkillExperienceTypes';

const MIN_CAST_MS = 1;

function powerTierFor(skill: Pick<CastableSkill, 'isUltimate' | 'renderType'>): SkillPowerTier {
  if (skill.isUltimate) return 5;
  switch (skill.renderType) {
    case 'aoe':
    case 'ground':
    case 'beam':
    case 'summon':
    case 'teleport':
      return 3;
    case 'projectile':
    case 'homing':
    case 'dash':
    case 'flurry':
      return 2;
    case 'buff':
    default:
      return 2;
  }
}

function grammarFor(skill: Pick<CastableSkill, 'category'>): SkillMotionGrammar {
  switch (skill.category) {
    case 'style':
      return 'physical';
    case 'sword':
      return 'blade';
    case 'gun':
      return 'ballistic';
    case 'fruit':
      return 'energy';
    case 'utility':
    default:
      return 'utility';
  }
}

function defaultTravelMs(renderType: SkillRenderType): number {
  switch (renderType) {
    case 'projectile':
    case 'homing':
      return 150;
    case 'beam':
      return 55;
    case 'ground':
      return 110;
    case 'dash':
    case 'teleport':
      return 45;
    case 'summon':
      return 90;
    case 'flurry':
      return 35;
    case 'aoe':
    case 'buff':
    default:
      return 20;
  }
}

function impactEnvelopeFor(tier: SkillPowerTier): SkillImpactEnvelope {
  switch (tier) {
    case 5:
      return { preImpactMs: 70, peakImpactMs: 90, postImpactMs: 260, hitStopMs: 70 };
    case 4:
      return { preImpactMs: 55, peakImpactMs: 75, postImpactMs: 220, hitStopMs: 55 };
    case 3:
      return { preImpactMs: 45, peakImpactMs: 60, postImpactMs: 170, hitStopMs: 42 };
    case 2:
      return { preImpactMs: 30, peakImpactMs: 45, postImpactMs: 130, hitStopMs: 28 };
    case 1:
    default:
      return { preImpactMs: 20, peakImpactMs: 30, postImpactMs: 90, hitStopMs: 18 };
  }
}

function buildPhases(castTimeMs: number, renderType: SkillRenderType, tier: SkillPowerTier): SkillExperiencePhaseWindow[] {
  const castMs = Math.max(MIN_CAST_MS, castTimeMs);
  const anticipationMs = Math.max(16, Math.round(castMs * 0.45));
  const chargeStartMs = Math.min(anticipationMs, Math.round(castMs * 0.25));
  const chargeMs = Math.max(0, castMs - chargeStartMs);
  const releaseMs = Math.max(24, tier >= 4 ? 55 : 38);
  const travelMs = defaultTravelMs(renderType);
  const impactStartMs = castMs + travelMs;
  const impact = impactEnvelopeFor(tier);
  const aftermathStartMs = impactStartMs + impact.peakImpactMs;
  const recoveryStartMs = aftermathStartMs + impact.postImpactMs;
  const recoveryMs = tier >= 5 ? 240 : tier >= 3 ? 170 : 120;

  return [
    { phase: 'input', startMs: 0, durationMs: 16 },
    { phase: 'anticipation', startMs: 0, durationMs: anticipationMs },
    { phase: 'charge', startMs: chargeStartMs, durationMs: chargeMs },
    { phase: 'release', startMs: castMs, durationMs: releaseMs },
    { phase: 'travel', startMs: castMs, durationMs: travelMs },
    { phase: 'impact', startMs: impactStartMs, durationMs: impact.peakImpactMs },
    { phase: 'aftermath', startMs: aftermathStartMs, durationMs: impact.postImpactMs },
    { phase: 'recovery', startMs: recoveryStartMs, durationMs: recoveryMs },
  ];
}

/**
 * Presentation-only baseline recipe derived from the existing CastableSkill.
 * It deliberately does not alter cooldown, damage, range, hit timing or server authority.
 */
export function createDefaultSkillExperienceRecipe(
  skill: Pick<CastableSkill, 'id' | 'castTime' | 'renderType' | 'isUltimate' | 'category'>,
): SkillExperienceRecipe {
  const powerTier = powerTierFor(skill);
  return {
    skillId: skill.id,
    renderType: skill.renderType,
    category: skill.category,
    powerTier,
    motionGrammar: grammarFor(skill),
    phases: buildPhases(skill.castTime * 1_000, skill.renderType, powerTier),
    impact: impactEnvelopeFor(powerTier),
  };
}

export function phaseWindow(
  recipe: SkillExperienceRecipe,
  phase: SkillExperiencePhaseWindow['phase'],
): SkillExperiencePhaseWindow {
  const window = recipe.phases.find((candidate) => candidate.phase === phase);
  if (!window) throw new Error(`Skill experience recipe ${recipe.skillId} is missing phase ${phase}`);
  return window;
}

export function validateSkillExperienceRecipe(recipe: SkillExperienceRecipe): string[] {
  const errors: string[] = [];
  const required: SkillExperiencePhaseWindow['phase'][] = [
    'input',
    'anticipation',
    'charge',
    'release',
    'travel',
    'impact',
    'aftermath',
    'recovery',
  ];

  for (const phase of required) {
    const matches = recipe.phases.filter((candidate) => candidate.phase === phase);
    if (matches.length !== 1) errors.push(`${phase} must appear exactly once`);
  }
  for (const window of recipe.phases) {
    if (!Number.isFinite(window.startMs) || window.startMs < 0) errors.push(`${window.phase}.startMs must be >= 0`);
    if (!Number.isFinite(window.durationMs) || window.durationMs < 0) errors.push(`${window.phase}.durationMs must be >= 0`);
  }
  if (recipe.impact.hitStopMs < 0 || recipe.impact.hitStopMs > 100) {
    errors.push('impact.hitStopMs must be between 0 and 100');
  }

  return errors;
}
