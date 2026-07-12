import { describe, expect, it } from 'vitest';
import { ProgressionManager } from '../ProgressionManager';
import type { RewardContribution } from '../ProgressionTypes';
import { QuestManager } from '../../quest/QuestManager';
import { MemoryStorage } from './testUtils';

describe('Phase 6 reward loop E2E', () => {
  it('accepts quest, processes five deaths, levels up, rewards mastery and reloads save', () => {
    const storage = new MemoryStorage();
    const progression = new ProgressionManager({ storage });
    const quests = new QuestManager(progression, () => ({
      itemId: 'basic-brawl',
      category: 'style',
      name: 'หมัด',
    }));
    expect(quests.acceptQuest('starter-crabs').accepted).toBe(true);

    const contribution: RewardContribution = {
      enemyId: 'crab',
      totalDamage: 70,
      lastHitItemId: 'basic-brawl',
      lastHitCategory: 'style',
      highestDamageItemId: 'basic-brawl',
      highestDamageCategory: 'style',
      killed: true,
    };
    for (let i = 0; i < 5; i++) {
      progression.grantEnemyRewards(
        {
          id: 'crab',
          level: 2,
          isBoss: false,
          reward: { playerExp: 30, masteryExp: 18, coins: 12 },
        },
        contribution,
      );
      progression.events.emit('monster:killed', {
        monsterId: 'crab',
        monsterType: 'crab',
        isBoss: false,
        position: { x: 0, y: 0, z: 0 },
        contribution,
      });
    }

    const state = progression.getState();
    expect(state.activeQuestId).toBeNull();
    expect(state.player.level).toBe(2);
    expect(state.player.statPoints).toBe(3);
    expect(state.coins).toBe(120);
    expect(state.mastery['basic-brawl'].level).toBe(2);
    progression.save();

    const reloaded = new ProgressionManager({ storage }).getState();
    expect(reloaded.player.level).toBe(2);
    expect(reloaded.coins).toBe(120);
    expect(reloaded.mastery['basic-brawl'].level).toBe(2);
    expect(reloaded.completedQuestIds).toContain('starter-crabs');
  });
});
