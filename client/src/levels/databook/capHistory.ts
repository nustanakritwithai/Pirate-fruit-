import type { LevelCapHistoryEntry } from '../types';

/** ประวัติการเพิ่ม Level Cap */
export const LEVEL_CAP_HISTORY: readonly LevelCapHistoryEntry[] = [
  { update: '27.4', previousCap: 2750, newCap: 2800 },
  { update: '27.0', previousCap: 2650, newCap: 2750 },
  { update: '26', previousCap: 2600, newCap: 2650 },
  { update: '24', previousCap: 2550, newCap: 2600 },
  { update: '20', previousCap: 2450, newCap: 2550 },
  { update: '17.3.5', previousCap: 2400, newCap: 2450 },
  { update: '17.3', previousCap: 2300, newCap: 2400 },
  { update: '17.2', previousCap: 2200, newCap: 2300 },
  { update: '17.1', previousCap: 2100, newCap: 2200 },
  { update: '16', previousCap: 2000, newCap: 2100 },
  { update: '15', previousCap: 1525, newCap: 2000 },
  { update: '14', previousCap: 1450, newCap: 1525 },
] as const;
