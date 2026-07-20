import type {
  OnboardingSave,
  OnboardingSignal,
  OnboardingSnapshot,
  OnboardingStep,
} from './types';

export interface StepEntry {
  snapshot: OnboardingSnapshot;
  signalCounts: ReadonlyMap<OnboardingSignal, number>;
}

function planarDistance(
  ax: number | null,
  az: number | null,
  bx: number | null,
  bz: number | null,
): number {
  if (ax === null || az === null || bx === null || bz === null) return 0;
  return Math.hypot(ax - bx, az - bz);
}

function angleDistance(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

export function stepIsComplete(
  step: OnboardingStep,
  current: OnboardingSnapshot,
  entry: StepEntry,
  signalCounts: ReadonlyMap<OnboardingSignal, number>,
  isVisible: (selector: string) => boolean,
): boolean {
  const completion = step.completion;
  switch (completion.type) {
    case 'manual':
      return false;
    case 'move':
      return planarDistance(current.x, current.z, entry.snapshot.x, entry.snapshot.z) >= completion.distance;
    case 'look':
      return angleDistance(current.cameraYaw, entry.snapshot.cameraYaw) >= completion.radians;
    case 'airborne':
      return current.y - current.groundY >= completion.height;
    case 'dash':
      return current.dashCooldownFraction > 0.02;
    case 'visible':
      return isVisible(completion.selector);
    case 'quest-active':
      return current.activeQuest;
    case 'signal':
      return (signalCounts.get(completion.signal) ?? 0)
        > (entry.signalCounts.get(completion.signal) ?? 0);
    case 'boat-active':
      return current.boatActive;
    case 'boat-rider':
      return completion.state === 'deck'
        ? current.boatRiderState !== 'off'
        : current.boatRiderState === 'helm';
    case 'boat-move':
      return planarDistance(
        current.boatX,
        current.boatZ,
        entry.snapshot.boatX,
        entry.snapshot.boatZ,
      ) >= completion.distance;
  }
}

export function parseOnboardingSave(raw: string | null, stepCount: number): OnboardingSave | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<OnboardingSave>;
    if (value.version !== 1) return null;
    const stepIndex = Number.isFinite(value.stepIndex)
      ? Math.max(0, Math.min(stepCount - 1, Math.floor(value.stepIndex!)))
      : 0;
    return {
      version: 1,
      stepIndex,
      completed: value.completed === true,
      skipped: value.skipped === true,
    };
  } catch {
    return null;
  }
}
