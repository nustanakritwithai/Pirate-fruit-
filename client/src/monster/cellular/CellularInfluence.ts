import { MONSTER_CELLULAR_CONFIG } from './MonsterCellularConfig';

/** Weighted Conway — larger/boss cells contribute more to neighbor influence. */
export function resolveInfluenceWeight(speciesId: string, kind?: string): number {
  if (kind === 'boss') return MONSTER_CELLULAR_CONFIG.influenceBoss;
  if (kind === 'crab' || kind === 'grunt') return MONSTER_CELLULAR_CONFIG.influenceDefault;
  if (speciesId.includes('boss')) return MONSTER_CELLULAR_CONFIG.influenceBoss;
  return MONSTER_CELLULAR_CONFIG.influenceDefault;
}
