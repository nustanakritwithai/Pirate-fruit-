import type { ExpStackingRule } from '../types';

/** กฎการซ้อน EXP Boost */
export const EXP_STACKING_RULES: readonly ExpStackingRule[] = [
  {
    id: 'duration-stack',
    rule: 'Multiple 2x EXP boosts stack duration, not multiplier',
    ruleTh: 'ซ้อน 2x EXP ได้แค่เพิ่มเวลา ตัวคูณยังคง 2x',
  },
  {
    id: 'multiplier-cap',
    rule: '2x EXP multiplier is always double regardless of source count',
    ruleTh: 'ตัวคูณ 2x EXP ไม่เกิน 2 เท่า ไม่ว่าซื้อกี่ครั้ง',
  },
  {
    id: 'death-grace',
    rule: '2x EXP players gain 5 extra seconds after death to compensate respawn',
    ruleTh: 'มี 2x EXP ตายแล้วได้เวลา boost บวก 5 วินาที',
  },
  {
    id: 'max-level-no-exp',
    rule: 'At max level, no more EXP can be acquired',
    ruleTh: 'เลเวลสูงสุดแล้วไม่ได้รับ EXP เพิ่ม',
  },
] as const;
