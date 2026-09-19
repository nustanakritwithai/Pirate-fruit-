import type { BossMasteryReward } from '../types';

export const BOSS_MASTERY_REWARDS: readonly BossMasteryReward[] = [
  {
    id: 'cake-queen',
    name: 'Cake Queen',
    nameTh: 'Cake Queen',
    approximateMastery: 2_200_000,
    notes: 'Highest mastery drop among bosses (without 2x Mastery)',
  },
  {
    id: 'longma',
    name: 'Longma',
    nameTh: 'Longma',
    notes: 'Faster to kill with more mastery than similar-HP bosses — recommended over Cake Queen for grinding',
  },
] as const;
