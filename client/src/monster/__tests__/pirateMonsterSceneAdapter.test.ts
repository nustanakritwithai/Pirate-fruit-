import { describe, expect, it, vi } from 'vitest';
import { PirateMonsterSceneAdapter } from '../PirateMonsterSceneAdapter';

const aim = { forwardX: 0, forwardZ: 1, range: 8 };
const roster = [{ instanceId: 'm-a', monsterType: 'crab', availability: 'unthrown' as const,
  skills: [{ skillId: 'claw', cooldownRemaining: 0 }] }];

describe('PirateMonsterSceneAdapter', () => {
  it('queues one throw, keeps character panel, then toggles the same monster panel', () => {
    const onThrow = vi.fn(() => true);
    const adapter = new PirateMonsterSceneAdapter({ onThrow });
    adapter.setRoster(roster);
    expect(adapter.handleMonsterButton('m-a', aim)).toBe('throwQueued');
    expect(adapter.panel).toEqual({ kind: 'character' });
    expect(adapter.handleMonsterButton('m-a', aim)).toBe('ignored');
    expect(onThrow).toHaveBeenCalledTimes(1);
    expect(adapter.confirmThrow('m-a')).toBe(true);
    expect(adapter.handleMonsterButton('m-a', aim)).toBe('panelOpened');
    expect(adapter.handleMonsterButton('m-a', aim)).toBe('panelClosed');
  });

  it('binds skill requests to instance id and rejects stale/disabled slots', () => {
    const onSkill = vi.fn(() => true);
    const adapter = new PirateMonsterSceneAdapter({ onThrow: () => true, onSkill });
    adapter.setRoster(roster);
    adapter.handleMonsterButton('m-a', aim);
    adapter.confirmThrow('m-a');
    adapter.handleMonsterButton('m-a', aim);
    expect(adapter.handleSkill('claw', aim)).toBe(true);
    expect(onSkill).toHaveBeenCalledWith({ instanceId: 'm-a', skillId: 'claw', aim });
    adapter.setRoster([{ ...roster[0], skills: [{ skillId: 'claw', cooldownRemaining: 2 }] }]);
    expect(adapter.handleSkill('claw', aim)).toBe(false);
  });

  it('resets a pending throw on rejection and clears the panel when roster changes', () => {
    const adapter = new PirateMonsterSceneAdapter({ onThrow: () => true });
    adapter.setRoster(roster);
    expect(adapter.handleMonsterButton('m-a', aim)).toBe('throwQueued');
    expect(adapter.rejectThrow('m-a')).toBe(true);
    expect(adapter.handleMonsterButton('m-a', aim)).toBe('throwQueued');
    adapter.setRoster([]);
    expect(adapter.panel).toEqual({ kind: 'character' });
  });
});

