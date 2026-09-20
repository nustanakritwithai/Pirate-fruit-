/**
 * Phase 8 — Skill Gameplay Databook: จุดเข้าถึงค่าที่ใช้ต่อสู้จริงของทุกสกิล (429 ท่า)
 */

import { SKILL_GAMEPLAY } from './generated';
import type { SkillGameplay } from './types';
import { SKILL_RESOURCE_CATALOG } from '@pirate-fruit/shared';

export { SKILL_GAMEPLAY };
export type {
  SkillGameplay,
  SkillArchetype,
  SkillSlotKey,
  CcSpec,
  CcType,
  DotSpec,
} from './types';

export function getSkillGameplay(id: string): SkillGameplay | undefined {
  const gameplay = SKILL_GAMEPLAY[id];
  const resource = SKILL_RESOURCE_CATALOG[id];
  return gameplay && resource
    ? { ...gameplay, cooldown: resource.cooldownMs / 1000, energy: resource.mpCost }
    : gameplay;
}

export const ALL_SKILL_GAMEPLAY: readonly SkillGameplay[] = Object.values(SKILL_GAMEPLAY);
