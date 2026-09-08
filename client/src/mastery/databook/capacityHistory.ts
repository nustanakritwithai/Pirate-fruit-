import type { MasteryCapacityHistoryEntry } from '../types';

export const MASTERY_CAPACITY_HISTORY: readonly MasteryCapacityHistoryEntry[] = [
  {
    id: 'update-1',
    update: 'Update 1',
    change: 'Mastery released',
    changeTh: 'เปิดระบบ Mastery',
  },
  {
    id: 'update-3',
    update: 'Update 3',
    change: 'Reduced mastery EXP required to level up',
    changeTh: 'ลด EXP ที่ต้องใช้เลเวล Mastery',
  },
  {
    id: 'update-3-5',
    update: 'Update 3.5',
    change: 'Mastery capacity 150 → 500',
    changeTh: 'เพดาน Mastery 150 → 500',
  },
  {
    id: 'update-8',
    update: 'Update 8',
    change: 'Mastery capacity 500 → 600',
    changeTh: 'เพดาน Mastery 500 → 600',
  },
  {
    id: 'update-17-2',
    update: 'Update 17.2',
    change: 'Reworked mastery stat buff: 1 point per 4 mastery + level % (up to 10% at 600)',
    changeTh: 'ปรับสูตรโบนัสสเตตัส: ทุก 4 Mastery + % จากเลเวลผู้เล่น',
  },
  {
    id: 'update-17-3-5',
    update: 'Update 17.3.5',
    change: 'Removed "(Max 600)" UI text',
    changeTh: 'ลบข้อความ "(Max 600)" ออกจาก UI',
  },
] as const;
