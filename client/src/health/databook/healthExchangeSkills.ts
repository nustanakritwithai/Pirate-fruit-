import type { HealthExchangeSkill } from '../types';

/** สกิลที่แลก HP เป็นพลังโจมตีหรือ mobility */
export const HEALTH_EXCHANGE_SKILLS: readonly HealthExchangeSkill[] = [
  {
    id: 'bomb-v-self-destruct',
    fruitId: 'bomb',
    moveKey: 'V',
    exchange: 'health-for-damage',
    exchangeTh: 'แลก HP เป็นดาเมจ',
    description: "Bomb's [V] Self Destruct exchanges health for damage",
  },
  {
    id: 'bomb-f-explosive-jump',
    fruitId: 'bomb',
    moveKey: 'F',
    exchange: 'health-for-jumps',
    exchangeTh: 'แลก HP เป็นจำนวนกระโดด',
    description: "Bomb's [F] Explosive Jump exchanges health for more jumps",
  },
] as const;
