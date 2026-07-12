import type { ExpSourceDefinition } from '../types';

/** แหล่ง EXP หลักจาก Blox Fruits Wiki */
export const EXP_SOURCES: readonly ExpSourceDefinition[] = [
  {
    id: 'quests',
    name: 'Quests',
    nameTh: 'เควส',
    kind: 'quest',
    description: 'เควสจาก NPC — มักให้ EXP พอเลเวลอัป 1 ครั้ง, เควสเลเวลสูงให้มากขึ้น',
  },
  {
    id: 'enemies',
    name: 'Enemies',
    nameTh: 'ศัตรู',
    kind: 'enemy',
    description: 'ฆ่า NPC ปกติ — ได้ EXP น้อยเมื่อเทียบกับเควส',
  },
  {
    id: 'bosses',
    name: 'Bosses',
    nameTh: 'บอส',
    kind: 'boss',
    description: 'ฆ่าบอส — ได้ EXP และเงิน, บางบอสให้เลเวลตรง (ไม่ผ่าน EXP)',
  },
  {
    id: 'raid-bosses',
    name: 'Raid Bosses',
    nameTh: 'บอส Raid',
    kind: 'raid-boss',
    description: 'บอสใน Raid — ให้ EXP สูง, บางตัวให้หลายเลเวลทีเดียว',
  },
  {
    id: 'fishing',
    name: 'Fishing',
    nameTh: 'ตกปลา',
    kind: 'fishing',
    description: 'จับปลาสำเร็จได้ 25% EXP ของเลเวลปัจจุบัน (ไม่ได้ถ้าได้ Soggy Boot)',
  },
  {
    id: 'gravestone',
    name: 'Gravestone',
    nameTh: 'ป้ายหลุมศพ',
    kind: 'gravestone',
    description: 'Haunted Castle — 49% โอกาสได้ Blessing EXP',
  },
  {
    id: 'codes',
    name: 'Codes',
    nameTh: 'โค้ด',
    kind: 'code',
    description: 'โค้ดบางตัวให้ EXP หรือเลเวลตรง',
  },
  {
    id: 'shop-2x-exp',
    name: '2x EXP Boost',
    nameTh: 'บูสต์ EXP 2 เท่า',
    kind: 'shop-boost',
    description: 'ซื้อจากร้าน — คูณ EXP ที่ได้, ตายแล้วได้บวก 5 วินาทีชดเชย respawn',
  },
] as const;
