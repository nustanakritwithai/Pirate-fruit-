import type { SurvivalTitle } from '../types';

/** Title ที่ได้จากรอดชีวิตด้วย HP ต่ำ (Second/Third Sea) */
export const SURVIVAL_TITLES: readonly SurvivalTitle[] = [
  {
    id: 'undefeated-one',
    titleNumber: 80,
    name: 'The Undefeated One',
    nameTh: 'The Undefeated One',
    condition: 'Receive damage from a player and survive with less than 50 HP',
    conditionTh: 'โดนผู้เล่นทำดาเมจและรอดด้วย HP น้อยกว่า 50',
    seaRequirement: 'Second Sea or Third Sea',
  },
  {
    id: 'immortal-being',
    titleNumber: 81,
    name: 'Immortal Being',
    nameTh: 'Immortal Being',
    condition: 'Receive damage from a player and survive with 1 HP',
    conditionTh: 'โดนผู้เล่นทำดาเมจและรอดด้วย HP เหลือ 1',
    seaRequirement: 'Second Sea or Third Sea',
  },
] as const;
