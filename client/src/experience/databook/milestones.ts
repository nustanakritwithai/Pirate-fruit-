import type { ExpMilestone } from '../types';

/** เป้าหมาย EXP สำคัญจาก wiki */
export const EXP_MILESTONES: readonly ExpMilestone[] = [
  {
    id: 'second-sea',
    name: 'Second Sea Gate',
    nameTh: 'ทะเลที่ 2',
    targetLevel: 700,
    cumulativeExp: 3_320_000_000,
    description: 'EXP สะสมถึง Second Sea (wiki)',
  },
  {
    id: 'third-sea-additional',
    name: 'Third Sea (additional)',
    nameTh: 'ทะเลที่ 3 (ส่วนเพิ่ม)',
    targetLevel: 1500,
    cumulativeExp: 23_000_000_000,
    description: 'EXP เพิ่มจาก 700 ถึง 1500 (wiki)',
  },
  {
    id: 'third-sea-total',
    name: 'Third Sea (total)',
    nameTh: 'ทะเลที่ 3 (รวม)',
    targetLevel: 1500,
    cumulativeExp: 26_320_000_000,
    description: 'EXP สะสมรวมถึง Third Sea (wiki)',
  },
  {
    id: 'max-level',
    name: 'Max Level',
    nameTh: 'เลเวลสูงสุด',
    targetLevel: 2800,
    cumulativeExp: 143_840_871_332,
    description: 'EXP สะสมถึงเลเวล 2800',
  },
] as const;
