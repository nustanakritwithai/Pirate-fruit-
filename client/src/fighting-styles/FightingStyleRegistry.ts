import { FIGHTING_STYLES, FIGHTING_STYLE_BY_ID } from './databook/styles';
import type { FightingStyleDefinition, FightingStyleSeaTier } from './types';

export { FIGHTING_STYLES, FIGHTING_STYLE_BY_ID };

export function getFightingStyle(id: string): FightingStyleDefinition | undefined {
  return FIGHTING_STYLE_BY_ID[id];
}

export function listFightingStylesBySeaTier(tier: FightingStyleSeaTier): FightingStyleDefinition[] {
  return FIGHTING_STYLES.filter((s) => s.seaTier === tier);
}
