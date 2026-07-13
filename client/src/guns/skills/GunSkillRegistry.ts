import { GUN_SKILLS, GUN_SKILL_BY_ID } from './databook/skills';
import type { GunSkillDefinition } from './types';

export { GUN_SKILLS, GUN_SKILL_BY_ID };

export function getGunSkill(id: string): GunSkillDefinition | undefined {
  return GUN_SKILL_BY_ID[id];
}

export function listSkillsForGun(gunId: string): GunSkillDefinition[] {
  return GUN_SKILLS.filter((s) => s.gunId === gunId);
}

export function listUnlockedGunSkills(gunId: string, mastery: number): GunSkillDefinition[] {
  const all = listSkillsForGun(gunId);
  const unlocked = all.filter((s) => s.mastery == null || s.mastery <= mastery);
  const bestByKey = new Map<string, GunSkillDefinition>();
  for (const s of unlocked) {
    const prev = bestByKey.get(s.key);
    if (!prev || (s.mastery ?? 0) > (prev.mastery ?? 0)) bestByKey.set(s.key, s);
  }
  return [...bestByKey.values()];
}
