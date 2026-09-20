import { describe, expect, it } from 'vitest';
import { CentralQuestAdapter } from './centralQuestAdapter.js';
import { defaultPlayerState } from '../player/playerState.js';

describe('CentralQuestAdapter', () => {
  it('accepts and advances the shared databook quest without mutating input', () => {
    const adapter = new CentralQuestAdapter();
    const original = defaultPlayerState();
    const accepted = adapter.accept(original, 'starter-crabs');
    expect(original.progression.activeQuestId).toBeNull();
    expect(accepted.state.progression.activeQuestId).toBe('starter-crabs');

    const progressed = adapter.progress(accepted.state, [
      { kind: 'kill', targetId: 'crab', amount: 5 },
    ]);
    expect(progressed.result.schemaVersion).toBe(1);
    expect(progressed.result.completed).toBe(true);
    expect(progressed.state.progression.activeQuestProgress).toEqual([5]);
  });

  it('uses shared reward and level formulas, then clears the active quest', () => {
    const adapter = new CentralQuestAdapter();
    const accepted = adapter.accept(defaultPlayerState(), 'starter-crabs');
    const progressed = adapter.progress(accepted.state, [
      { kind: 'kill', targetId: 'crab', amount: 5 },
    ]);
    const claimed = adapter.claim(progressed.state, 'starter-crabs');
    expect(claimed.result.coins).toBe(60);
    expect(claimed.result.playerExp).toBe(120);
    expect(claimed.state.progression.coins).toBe(60);
    expect(claimed.state.progression.activeQuestId).toBeNull();
    expect(claimed.state.progression.completedQuestIds).toContain('starter-crabs');
    expect(claimed.state.progression.mastery.combat?.exp).toBe(15);
  });

  it('reports a completed active quest and includes protocol versions', () => {
    const adapter = new CentralQuestAdapter();
    const accepted = adapter.accept(defaultPlayerState(), 'starter-crabs');
    const progressed = adapter.progress(accepted.state, [{ kind: 'kill', targetId: 'crab', amount: 5 }]);
    const state = adapter.state(progressed.state);
    expect(state.active?.status).toBe('completed');
    expect(accepted.result.schemaVersion).toBe(1);
  });

  it('rejects progress for a different target and preserves canonical state boundaries', () => {
    const adapter = new CentralQuestAdapter();
    const accepted = adapter.accept(defaultPlayerState(), 'starter-crabs');
    const progressed = adapter.progress(accepted.state, [
      { kind: 'kill', targetId: 'wrong-target', amount: 99 },
    ]);
    expect(progressed.result.progress).toEqual([0]);
    expect(progressed.result.completed).toBe(false);
    expect(progressed.state).not.toBe(accepted.state);
  });
});
