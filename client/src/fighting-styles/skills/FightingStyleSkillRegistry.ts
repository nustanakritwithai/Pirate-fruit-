import { FIGHTING_STYLE_SKILLS, FIGHTING_STYLE_SKILL_BY_ID } from './databook/skills';
import type { FightingStyleSkillDefinition } from './types';

export { FIGHTING_STYLE_SKILLS, FIGHTING_STYLE_SKILL_BY_ID };

export function getFightingStyleSkill(id: string): FightingStyleSkillDefinition | undefined {
  return FIGHTING_STYLE_SKILL_BY_ID[id];
}

export function listSkillsForFightingStyle(styleId: string): FightingStyleSkillDefinition[] {
  return FIGHTING_STYLE_SKILLS.filter((s) => s.styleId === styleId);
}

export function listUnlockedFightingStyleSkills(
  styleId: string,
  mastery: number,
): FightingStyleSkillDefinition[] {
  return listSkillsForFightingStyle(styleId).filter(
    (s) => s.mastery == null || s.mastery <= mastery,
  );
}
