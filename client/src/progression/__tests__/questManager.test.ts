import { describe, expect, it } from 'vitest';
import { ProgressionManager } from '../ProgressionManager';
import { QuestManager } from '../../quest/QuestManager';
import { MemoryStorage } from './testUtils';

describe('QuestManager', () => {
  it('enforces level requirements', () => {
    const progression = new ProgressionManager({ storage: new MemoryStorage() });
    const quests = new QuestManager(progression, () => ({
      itemId: 'basic-brawl',
      category: 'style',
      name: 'หมัด',
    }));
    expect(quests.acceptQuest('starter-pirates')).toEqual({
      accepted: false,
      reason: 'level-too-low',
      requiredLevel: 3,
    });
  });

  it('auto-claims a completed kill quest and clears the active slot', () => {
    const progression = new ProgressionManager({ storage: new MemoryStorage() });
    const quests = new QuestManager(progression, () => ({
      itemId: 'basic-brawl',
      category: 'style',
      name: 'หมัด',
    }));
    expect(quests.acceptQuest('starter-crabs').accepted).toBe(true);
    expect(quests.acceptQuest('starter-crabs')).toEqual({
      accepted: false,
      reason: 'already-active',
    });
    for (let i = 0; i < 5; i++) quests.recordKill('crab', false);

    const state = progression.getState();
    expect(state.activeQuestId).toBeNull();
    expect(state.coins).toBe(60);
    expect(state.player.level).toBe(2);
    expect(state.mastery['basic-brawl'].exp).toBe(15);
    expect(state.completedQuestIds).toContain('starter-crabs');
  });
});
