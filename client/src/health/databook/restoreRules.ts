import type { HealthRestoreRule } from '../types';

/** กฎฟื้น HP อัตโนมัติ */
export const HEALTH_RESTORE_RULES: readonly HealthRestoreRule[] = [
  {
    id: 'level-up',
    trigger: 'Level up',
    triggerTh: 'เลเวลอัป',
    restoresHealth: true,
    restoresEnergy: true,
    blockedWhileInCombat: true,
    description: 'Health and energy restore on level up unless in combat',
  },
  {
    id: 'quest-complete',
    trigger: 'Quest complete',
    triggerTh: 'ทำเควสสำเร็จ',
    restoresHealth: true,
    restoresEnergy: true,
    blockedWhileInCombat: true,
    description: 'Health and energy restore on quest completion unless in combat',
  },
] as const;
