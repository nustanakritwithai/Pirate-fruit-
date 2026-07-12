import { FRUIT_SKILLS, FRUIT_SKILL_BY_ID } from './databook/skills';
import type { FruitSkillDefinition } from './types';

export { FRUIT_SKILLS, FRUIT_SKILL_BY_ID };

export function getFruitSkill(id: string): FruitSkillDefinition | undefined {
  return FRUIT_SKILL_BY_ID[id];
}

export function listSkillsForFruit(fruitId: string): FruitSkillDefinition[] {
  return FRUIT_SKILLS.filter((s) => s.fruitId === fruitId);
}

export function listSkillsByKey(fruitId: string, key: string): FruitSkillDefinition[] {
  return FRUIT_SKILLS.filter((s) => s.fruitId === fruitId && s.key === key);
}

export function listUnlockedSkills(
  fruitId: string,
  mastery: number,
  awakened = false,
): FruitSkillDefinition[] {
  return listSkillsForFruit(fruitId).filter((s) => {
    if (s.mastery != null && s.mastery > mastery) return false;
    const isAwakened = s.version.includes('V2') || s.version.includes('Transformed') || s.awakeningFragmentCost != null;
    if (isAwakened && !awakened) return false;
    if (!isAwakened && awakened && s.version.includes('V1')) return false;
    return true;
  });
}
