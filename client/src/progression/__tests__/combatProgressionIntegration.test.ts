import { describe, expect, it } from 'vitest';
import { LOADOUT_ITEMS, SKILLS } from '../../combat/CombatData';
import { ProgressionManager } from '../ProgressionManager';
import { MemoryStorage } from './testUtils';

describe('Combat Framework v2 + Phase 6 integration', () => {
  it('preserves the Phase 5 v2 M1 damage at default stats', () => {
    const progression = new ProgressionManager({ storage: new MemoryStorage() });
    const brawl = LOADOUT_ITEMS['basic-brawl'];
    const damages = brawl.combo.map((hit) =>
      brawl.damage * hit.multiplier * progression.getDamageMultiplier(brawl.category),
    );
    expect(damages).toEqual([20, 21, 23, 35]);
  });

  it('keeps all existing skills unlocked and at their original base damage', () => {
    const progression = new ProgressionManager({ storage: new MemoryStorage() });
    expect(SKILLS.map((skill) => skill.damage)).toEqual([55, 45, 65]);
    for (const skill of SKILLS) {
      expect(skill.masteryRequired).toBe(0);
      expect(progression.canUseSkill('basic-brawl', skill)).toBe(true);
      expect(progression.getDamageMultiplier(skill.category)).toBe(1);
    }
  });

  it('adds only the progression multiplier after the v2 base/combo calculation', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      'pirate-fruit:progression-v1',
      JSON.stringify({
        version: 1,
        progression: {
          player: {
            level: 50,
            exp: 0,
            statPoints: 0,
            stats: { combat: 1, vitality: 1, blade: 50, ranged: 1, fruitPower: 1 },
          },
          mastery: {},
          coins: 0,
          completedQuestIds: [],
          activeQuestId: null,
          activeQuestProgress: [],
        },
      }),
    );
    const progression = new ProgressionManager({ storage });
    expect(progression.getDamageMultiplier('sword')).toBeCloseTo(1.588);
    expect(progression.getDamageMultiplier('style')).toBe(1);
  });
});
