import { describe, expect, it } from 'vitest';
import { SkillExperienceDirector } from '../SkillExperienceDirector';
import {
  createDefaultSkillExperienceRecipe,
  phaseWindow,
  validateSkillExperienceRecipe,
} from '../SkillExperienceRecipe';
import type { SkillExperienceSignal } from '../SkillExperienceTypes';

function firePunchRecipe() {
  return createDefaultSkillExperienceRecipe({
    id: 'fire-punch',
    castTime: 0.2,
    renderType: 'flurry',
    isUltimate: false,
    category: 'style',
  });
}

describe('skill experience recipe', () => {
  it('creates a complete monotonic phase contract from an existing skill', () => {
    const recipe = firePunchRecipe();
    expect(validateSkillExperienceRecipe(recipe)).toEqual([]);
    expect(recipe.powerTier).toBe(2);
    expect(recipe.motionGrammar).toBe('physical');
    expect(recipe.phases.map((phase) => phase.phase)).toEqual([
      'input',
      'anticipation',
      'charge',
      'release',
      'travel',
      'impact',
      'aftermath',
      'recovery',
    ]);
    expect(phaseWindow(recipe, 'release').startMs).toBe(200);
    expect(phaseWindow(recipe, 'impact').startMs).toBeGreaterThanOrEqual(200);
    expect(recipe.impact.hitStopMs).toBeLessThanOrEqual(100);
  });

  it('reserves tier 5 for ultimate presentation without changing gameplay fields', () => {
    const recipe = createDefaultSkillExperienceRecipe({
      id: 'ultimate-wave',
      castTime: 0.35,
      renderType: 'aoe',
      isUltimate: true,
      category: 'fruit',
    });
    expect(recipe.powerTier).toBe(5);
    expect(recipe.motionGrammar).toBe('energy');
    expect(recipe.impact.hitStopMs).toBe(70);
  });
});

describe('SkillExperienceDirector authority boundary', () => {
  it('allows immediate predicted feedback but blocks reaction/environment before confirmation', () => {
    const signals: SkillExperienceSignal[] = [];
    const director = new SkillExperienceDirector((signal) => signals.push(signal));
    const sessionId = director.startPredicted(firePunchRecipe(), 1_000);

    director.update(sessionId, 1_500);

    const predictedSignals = signals.filter((signal) => signal.authority === 'predicted');
    expect(predictedSignals.length).toBeGreaterThan(0);
    expect(predictedSignals.flatMap((signal) => signal.channels)).not.toContain('reaction');
    expect(predictedSignals.flatMap((signal) => signal.channels)).not.toContain('environment');
    expect(predictedSignals.some((signal) => signal.phase === 'impact')).toBe(false);
    expect(predictedSignals.some((signal) => signal.phase === 'aftermath')).toBe(false);
  });

  it('unlocks confirmed impact channels only after confirmation', () => {
    const signals: SkillExperienceSignal[] = [];
    const director = new SkillExperienceDirector((signal) => signals.push(signal));
    const sessionId = director.startPredicted(firePunchRecipe(), 0);

    expect(director.impact(sessionId, 210)).toBe(false);
    expect(director.confirm(sessionId, 200)).toBe(true);
    expect(director.impact(sessionId, 235)).toBe(true);
    expect(director.aftermath(sessionId, 300)).toBe(true);

    const impact = signals.find((signal) => signal.kind === 'impact');
    expect(impact?.authority).toBe('confirmed');
    expect(impact?.channels).toContain('reaction');
    expect(impact?.channels).toContain('environment');
    expect(impact?.channels).toContain('camera');
    expect(signals.some((signal) => signal.phase === 'aftermath' && signal.authority === 'confirmed')).toBe(true);
  });

  it('does not treat a late cast confirmation as a hit confirmation', () => {
    const signals: SkillExperienceSignal[] = [];
    const director = new SkillExperienceDirector((signal) => signals.push(signal));
    const sessionId = director.startPredicted(firePunchRecipe(), 0);

    expect(director.confirm(sessionId, 2_000)).toBe(true);
    expect(signals.some((signal) => signal.kind === 'impact')).toBe(false);
    expect(signals.some((signal) => signal.phase === 'impact')).toBe(false);
    expect(signals.some((signal) => signal.phase === 'aftermath')).toBe(false);
  });

  it('cancels predicted presentation cleanly after a server rejection', () => {
    const signals: SkillExperienceSignal[] = [];
    const director = new SkillExperienceDirector((signal) => signals.push(signal));
    const sessionId = director.startPredicted(firePunchRecipe(), 0);

    expect(director.reject(sessionId, 80, 'not-enough-authority')).toBe(true);
    expect(director.getSnapshot(sessionId)).toBeNull();
    expect(director.activeCount()).toBe(0);
    expect(signals[signals.length - 1]).toMatchObject({
      kind: 'cancel',
      reason: 'not-enough-authority',
    });
  });

  it('keeps session ids unique for repeated casts of the same skill', () => {
    const director = new SkillExperienceDirector();
    const first = director.startPredicted(firePunchRecipe(), 0);
    const second = director.startPredicted(firePunchRecipe(), 1);
    expect(first).not.toBe(second);
    expect(director.activeCount()).toBe(2);
  });
});
