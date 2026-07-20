import { describe, expect, it } from 'vitest';
import { stepIsComplete, parseOnboardingSave, type StepEntry } from '../OnboardingProgress';
import { GUIDE_TOPICS, ONBOARDING_STEPS } from '../TutorialRegistry';
import type { OnboardingSignal, OnboardingSnapshot, OnboardingStep } from '../types';

const snapshot = (patch: Partial<OnboardingSnapshot> = {}): OnboardingSnapshot => ({
  x: 0,
  y: 1,
  z: 0,
  groundY: 1,
  cameraYaw: 0,
  dashCooldownFraction: 0,
  islandId: 'starter-island',
  activeQuest: false,
  boatActive: false,
  boatRiderState: 'off',
  boatX: null,
  boatZ: null,
  ...patch,
});

const complete = (
  completion: OnboardingStep['completion'],
  current: Partial<OnboardingSnapshot>,
  entryPatch: Partial<OnboardingSnapshot> = {},
  signals: ReadonlyMap<OnboardingSignal, number> = new Map(),
  entrySignals: ReadonlyMap<OnboardingSignal, number> = new Map(),
  visible = false,
): boolean => {
  const entry: StepEntry = { snapshot: snapshot(entryPatch), signalCounts: entrySignals };
  return stepIsComplete(
    { id: 'test', title: '', body: '', hint: '', completion },
    snapshot(current),
    entry,
    signals,
    () => visible,
  );
};

describe('OnboardingProgress', () => {
  it('observes movement, camera, jump and dash without mutating gameplay', () => {
    expect(complete({ type: 'move', distance: 4 }, { x: 3, z: 4 })).toBe(true);
    expect(complete({ type: 'look', radians: 0.8 }, { cameraYaw: 0.81 })).toBe(true);
    expect(complete({ type: 'airborne', height: 0.45 }, { y: 1.5, groundY: 1 })).toBe(true);
    expect(complete({ type: 'dash' }, { dashCooldownFraction: 0.4 })).toBe(true);
    expect(complete({ type: 'dash' }, { dashCooldownFraction: 0 })).toBe(false);
  });

  it('uses existing UI and quest state as read-only completion signals', () => {
    expect(complete({ type: 'visible', selector: '.quest-board-root' }, {}, {}, new Map(), new Map(), true)).toBe(true);
    expect(complete({ type: 'quest-active' }, { activeQuest: true })).toBe(true);
  });

  it('does not accept an authoritative event that happened before entering the step', () => {
    const before = new Map<OnboardingSignal, number>([['monster-killed', 2]]);
    expect(complete({ type: 'signal', signal: 'monster-killed' }, {}, {}, before, before)).toBe(false);
    const after = new Map<OnboardingSignal, number>([['monster-killed', 3]]);
    expect(complete({ type: 'signal', signal: 'monster-killed' }, {}, {}, after, before)).toBe(true);
  });

  it('tracks boat summon, deck, helm and sailing distance', () => {
    expect(complete({ type: 'boat-active' }, { boatActive: true })).toBe(true);
    expect(complete({ type: 'boat-rider', state: 'deck' }, { boatRiderState: 'helm' })).toBe(true);
    expect(complete({ type: 'boat-rider', state: 'helm' }, { boatRiderState: 'deck' })).toBe(false);
    expect(complete(
      { type: 'boat-move', distance: 12 },
      { boatX: 13, boatZ: 0 },
      { boatX: 0, boatZ: 0 },
    )).toBe(true);
  });

  it('rejects bad saves and safely clamps restored progress', () => {
    expect(parseOnboardingSave(null, ONBOARDING_STEPS.length)).toBeNull();
    expect(parseOnboardingSave('{bad', ONBOARDING_STEPS.length)).toBeNull();
    expect(parseOnboardingSave('{"version":2}', ONBOARDING_STEPS.length)).toBeNull();
    expect(parseOnboardingSave(
      JSON.stringify({ version: 1, stepIndex: 999, completed: true, skipped: false }),
      ONBOARDING_STEPS.length,
    )).toEqual({
      version: 1,
      stepIndex: ONBOARDING_STEPS.length - 1,
      completed: true,
      skipped: false,
    });
  });

  it('keeps every tutorial and handbook entry data-driven and uniquely addressable', () => {
    expect(ONBOARDING_STEPS).toHaveLength(18);
    expect(new Set(ONBOARDING_STEPS.map((step) => step.id)).size).toBe(ONBOARDING_STEPS.length);
    expect(GUIDE_TOPICS.length).toBeGreaterThanOrEqual(11);
    expect(new Set(GUIDE_TOPICS.map((topic) => topic.id)).size).toBe(GUIDE_TOPICS.length);
    expect(GUIDE_TOPICS.map((topic) => topic.id)).toEqual(expect.arrayContaining([
      'combat', 'quests', 'inventory', 'shops', 'boats', 'trade', 'islands', 'multiplayer', 'pvp',
    ]));
  });
});
