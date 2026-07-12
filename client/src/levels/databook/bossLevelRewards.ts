import type { BossLevelReward } from '../types';

/** บอสที่ให้เลเวลตรง (ไม่ผ่าน EXP) — จาก Levels Wiki */
export const BOSS_LEVEL_REWARDS: readonly BossLevelReward[] = [
  { id: 'dough-king', name: 'Dough King', nameTh: 'ราชาโดว์', levelsGranted: 6 },
  { id: 'tyrant-of-the-skies', name: 'Tyrant of the Skies', nameTh: 'ทรราชน์แห่งนภา', levelsGranted: 6 },
  { id: 'leviathan', name: 'Leviathan', nameTh: 'เลวีอาธาน', levelsGranted: 5 },
  { id: 'darkbeard', name: 'Darkbeard', nameTh: 'ดาร์คเบียร์ด', levelsGranted: 3 },
  { id: 'greybeard', name: 'Greybeard', nameTh: 'เกรเบียร์ด', levelsGranted: 3 },
  { id: 'cake-prince', name: 'Cake Prince', nameTh: 'เจ้าชายเค้ก', levelsGranted: 3 },
  { id: 'rip-indra', name: 'rip_indra True Form', nameTh: 'ริป อินดรา', levelsGranted: 3 },
  { id: 'order', name: 'Order', nameTh: 'ออร์เดอร์', levelsGranted: 3 },
  { id: 'sea-beast', name: 'Sea Beast', nameTh: 'อสูรทะเล', levelsGranted: 1 },
  { id: 'terrorshark', name: 'Terrorshark', nameTh: 'เทอร์เรอร์ชาร์ค', levelsGranted: 1 },
] as const;
