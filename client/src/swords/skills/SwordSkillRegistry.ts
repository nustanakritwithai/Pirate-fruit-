import { SWORD_SKILLS, SWORD_SKILL_BY_ID } from './databook/skills';
import type { SwordSkillDefinition } from './types';

export { SWORD_SKILLS, SWORD_SKILL_BY_ID };

export function getSwordSkill(id: string): SwordSkillDefinition | undefined {
  return SWORD_SKILL_BY_ID[id];
}

export function listSkillsForSword(swordId: string): SwordSkillDefinition[] {
  return SWORD_SKILLS.filter((s) => s.swordId === swordId);
}

export function listUnlockedSwordSkills(swordId: string, mastery: number): SwordSkillDefinition[] {
  const all = listSkillsForSword(swordId);
  const unlocked = all.filter((s) => s.mastery == null || s.mastery <= mastery);
  const bestByKey = new Map<string, SwordSkillDefinition>();
  for (const s of unlocked) {
    const prev = bestByKey.get(s.key);
    if (!prev || (s.mastery ?? 0) > (prev.mastery ?? 0)) bestByKey.set(s.key, s);
  }
  return [...bestByKey.values()];
}
