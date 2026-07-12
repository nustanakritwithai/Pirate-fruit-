import { describe, expect, it } from 'vitest';
import {
  applyMasteryExp,
  canUseSkill,
  createMasteryEntry,
  getMasteryExpRequired,
} from '../MasterySystem';

describe('MasterySystem', () => {
  it('uses the configured mastery curve and supports multi-level rewards', () => {
    expect(getMasteryExpRequired(1)).toBe(59);
    const entry = createMasteryEntry('training-sword', 'sword');
    const result = applyMasteryExp(entry, 200);
    expect(result.newLevel).toBe(3);
    expect(result.levelsGained).toBe(2);
    expect(result.remainingExp).toBe(59);
  });

  it('checks mastery before a skill can start', () => {
    const skill = { id: 'future-skill', name: 'Future Skill', masteryRequired: 20 };
    expect(canUseSkill(19, skill)).toBe(false);
    expect(canUseSkill(20, skill)).toBe(true);
    expect(canUseSkill(1, { ...skill, masteryRequired: 0 })).toBe(true);
  });
});
