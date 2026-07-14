import { describe, expect, it } from 'vitest';
import { ProgressionManager } from '../../progression/ProgressionManager';
import { QuestManager } from '../QuestManager';
import { MemoryStorage } from '../../progression/__tests__/testUtils';

describe('QuestManager trade delivery', () => {
  it('progresses deliver quest when selling at target island', () => {
    const progression = new ProgressionManager({ storage: new MemoryStorage() });
    while (progression.level < 5) progression.addPlayerExp(9999);
    const quests = new QuestManager(progression, () => null);
    const accepted = quests.acceptQuest('trade-fish-to-desert');
    expect(accepted.accepted).toBe(true);

    progression.events.emit('trade:completed', {
      action: 'sell',
      islandId: 'sunscar-desert',
      commodityId: 'fresh-fish',
      quantity: 3,
    });

    const active = quests.getActiveQuest();
    expect(active?.progress[0]).toBe(3);

    progression.events.emit('trade:completed', {
      action: 'sell',
      islandId: 'sunscar-desert',
      commodityId: 'fresh-fish',
      quantity: 2,
    });
    expect(quests.getActiveQuest()).toBeNull();
  });
});
