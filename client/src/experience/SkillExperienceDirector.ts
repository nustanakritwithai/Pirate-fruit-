import {
  type SkillExperienceChannel,
  type SkillExperienceComponentTier,
  type SkillExperiencePhase,
  type SkillExperienceRecipe,
  type SkillExperienceSessionSnapshot,
  type SkillExperienceSignal,
} from './SkillExperienceTypes';
import { validateSkillExperienceRecipe } from './SkillExperienceRecipe';

interface ActiveSkillExperienceSession {
  recipe: SkillExperienceRecipe;
  snapshot: SkillExperienceSessionSnapshot;
  enteredPhases: Set<SkillExperiencePhase>;
}

export type SkillExperienceSignalListener = (signal: SkillExperienceSignal) => void;

const SAFE_PREDICTED_CHANNELS: Readonly<Record<SkillExperiencePhase, readonly SkillExperienceChannel[]>> = {
  input: ['animation', 'vfx', 'audio', 'haptic'],
  anticipation: ['animation', 'vfx', 'audio'],
  charge: ['animation', 'vfx', 'audio'],
  release: ['animation', 'vfx', 'audio'],
  travel: ['vfx', 'audio'],
  impact: [],
  aftermath: [],
  recovery: ['animation'],
};

const CONFIRMED_CHANNELS: Readonly<Record<SkillExperiencePhase, readonly SkillExperienceChannel[]>> = {
  input: ['animation', 'vfx', 'audio', 'haptic'],
  anticipation: ['animation', 'vfx', 'audio'],
  charge: ['animation', 'vfx', 'audio'],
  release: ['animation', 'vfx', 'audio'],
  travel: ['vfx', 'audio'],
  impact: ['vfx', 'audio', 'camera', 'haptic', 'reaction', 'environment'],
  aftermath: ['vfx', 'audio', 'environment'],
  recovery: ['animation'],
};

function componentTierFor(phase: SkillExperiencePhase): SkillExperienceComponentTier {
  switch (phase) {
    case 'input':
    case 'release':
    case 'impact':
    case 'recovery':
      return 'essential';
    case 'anticipation':
    case 'charge':
    case 'travel':
      return 'enhancement';
    case 'aftermath':
    default:
      return 'luxury';
  }
}

/**
 * Presentation-only coordinator for a skill lifecycle.
 *
 * The director never applies damage, cooldown, CC, HP, movement authority or target truth.
 * Predicted sessions may emit immediate local feedback, while reaction/environment/strong
 * impact channels remain blocked until the caller supplies Server/PvE confirmation.
 */
export class SkillExperienceDirector {
  private sequence = 0;
  private readonly sessions = new Map<string, ActiveSkillExperienceSession>();

  constructor(private readonly onSignal: SkillExperienceSignalListener = () => undefined) {}

  startPredicted(recipe: SkillExperienceRecipe, nowMs: number): string {
    const errors = validateSkillExperienceRecipe(recipe);
    if (errors.length > 0) {
      throw new Error(`Invalid skill experience recipe ${recipe.skillId}: ${errors.join('; ')}`);
    }
    const id = `${recipe.skillId}:${++this.sequence}`;
    const session: ActiveSkillExperienceSession = {
      recipe,
      enteredPhases: new Set<SkillExperiencePhase>(),
      snapshot: {
        id,
        skillId: recipe.skillId,
        authority: 'predicted',
        phase: 'input',
        startedAtMs: nowMs,
        lastUpdatedAtMs: nowMs,
        cancelled: false,
        completed: false,
      },
    };
    this.sessions.set(id, session);
    this.update(id, nowMs);
    return id;
  }

  confirm(sessionId: string, nowMs: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.snapshot.cancelled || session.snapshot.completed) return false;
    session.snapshot.authority = 'confirmed';
    session.snapshot.confirmedAtMs = nowMs;
    session.snapshot.lastUpdatedAtMs = Math.max(session.snapshot.lastUpdatedAtMs, nowMs);
    this.onSignal({
      sessionId,
      skillId: session.recipe.skillId,
      kind: 'server-confirmed',
      authority: 'confirmed',
      phase: session.snapshot.phase,
      atMs: nowMs,
      channels: [],
      componentTier: 'essential',
      powerTier: session.recipe.powerTier,
    });
    this.update(sessionId, nowMs);
    return true;
  }

  /**
   * Explicit confirmed hit/impact hook. Returns false for a predicted-only session so
   * callers cannot accidentally create enemy reaction or persistent aftermath before truth.
   */
  impact(sessionId: string, nowMs: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.snapshot.authority !== 'confirmed' || session.snapshot.cancelled || session.snapshot.completed) {
      return false;
    }
    session.snapshot.phase = 'impact';
    session.snapshot.lastUpdatedAtMs = Math.max(session.snapshot.lastUpdatedAtMs, nowMs);
    this.onSignal({
      sessionId,
      skillId: session.recipe.skillId,
      kind: 'impact',
      authority: 'confirmed',
      phase: 'impact',
      atMs: nowMs,
      channels: CONFIRMED_CHANNELS.impact,
      componentTier: 'essential',
      powerTier: session.recipe.powerTier,
    });
    return true;
  }

  update(sessionId: string, nowMs: number): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.snapshot.cancelled || session.snapshot.completed) return;
    const safeNow = Math.max(session.snapshot.startedAtMs, nowMs);
    session.snapshot.lastUpdatedAtMs = Math.max(session.snapshot.lastUpdatedAtMs, safeNow);
    const elapsedMs = safeNow - session.snapshot.startedAtMs;

    for (const window of session.recipe.phases) {
      if (window.startMs > elapsedMs || session.enteredPhases.has(window.phase)) continue;
      if (session.snapshot.authority === 'predicted' && (window.phase === 'impact' || window.phase === 'aftermath')) {
        continue;
      }
      session.enteredPhases.add(window.phase);
      session.snapshot.phase = window.phase;
      const channels = session.snapshot.authority === 'confirmed'
        ? CONFIRMED_CHANNELS[window.phase]
        : SAFE_PREDICTED_CHANNELS[window.phase];
      this.onSignal({
        sessionId,
        skillId: session.recipe.skillId,
        kind: 'phase-enter',
        authority: session.snapshot.authority,
        phase: window.phase,
        atMs: safeNow,
        channels,
        componentTier: componentTierFor(window.phase),
        powerTier: session.recipe.powerTier,
      });
    }
  }

  reject(sessionId: string, nowMs: number, reason = 'server-rejected'): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.snapshot.completed) return false;
    session.snapshot.cancelled = true;
    session.snapshot.lastUpdatedAtMs = Math.max(session.snapshot.lastUpdatedAtMs, nowMs);
    this.onSignal({
      sessionId,
      skillId: session.recipe.skillId,
      kind: 'cancel',
      authority: session.snapshot.authority,
      phase: session.snapshot.phase,
      atMs: nowMs,
      channels: ['animation', 'vfx', 'audio'],
      componentTier: 'essential',
      powerTier: session.recipe.powerTier,
      reason,
    });
    this.sessions.delete(sessionId);
    return true;
  }

  complete(sessionId: string, nowMs: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.snapshot.cancelled || session.snapshot.completed) return false;
    session.snapshot.completed = true;
    session.snapshot.phase = 'recovery';
    session.snapshot.lastUpdatedAtMs = Math.max(session.snapshot.lastUpdatedAtMs, nowMs);
    this.onSignal({
      sessionId,
      skillId: session.recipe.skillId,
      kind: 'complete',
      authority: session.snapshot.authority,
      phase: 'recovery',
      atMs: nowMs,
      channels: ['animation'],
      componentTier: 'essential',
      powerTier: session.recipe.powerTier,
    });
    this.sessions.delete(sessionId);
    return true;
  }

  getSnapshot(sessionId: string): SkillExperienceSessionSnapshot | null {
    const session = this.sessions.get(sessionId);
    return session ? { ...session.snapshot } : null;
  }

  getRecipe(sessionId: string): SkillExperienceRecipe | null {
    return this.sessions.get(sessionId)?.recipe ?? null;
  }

  activeCount(): number {
    return this.sessions.size;
  }
}
