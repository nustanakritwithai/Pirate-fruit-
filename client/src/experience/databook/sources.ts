import type { ExpSourceDefinition } from '../types';

/** วิธีได้ EXP จาก Experience Wiki */
export const EXP_SOURCES: readonly ExpSourceDefinition[] = [
  {
    id: 'quests',
    name: 'Quests',
    nameTh: 'เควส',
    kind: 'quest',
    description: 'รับเควสจาก NPC เพื่อ EXP และเงิน',
    notes: 'มักให้ EXP พอเลเวลอัป 1 ครั้ง, ฆ่าศัตรู 5-9 ตัว (ปกติ 8) หรือบอส 1 ตัว',
  },
  {
    id: 'combat-enemies',
    name: 'Combat (Enemies)',
    nameTh: 'ต่อสู้ (ศัตรู)',
    kind: 'combat',
    description: 'ฆ่า NPC ปกติได้ EXP และเงินเล็กน้อย',
    notes: 'EXP น้อยเมื่อเทียบเควส ยกเว้นศัตรูเลเวลสูงกว่าผู้เล่นมาก',
  },
  {
    id: 'combat-bosses',
    name: 'Combat (Bosses)',
    nameTh: 'ต่อสู้ (บอส)',
    kind: 'combat',
    description: 'ฆ่าบอสได้ EXP และเงิน',
    notes: 'บาง Raid Boss ให้เลเวลตรงแทน EXP (เช่น Order +3 levels)',
  },
  {
    id: 'praying-gravestone',
    name: 'Praying (Gravestone)',
    nameTh: 'สวดมนต์ (ป้ายหลุมศพ)',
    kind: 'praying',
    description: 'สวดที่ Gravestone ใน Haunted Castle, Third Sea',
    notes: '49% โอกาสได้ Blessing EXP',
  },
  {
    id: 'fishing',
    name: 'Fishing',
    nameTh: 'ตกปลา',
    kind: 'fishing',
    description: 'จับปลาสำเร็จได้ 25% EXP ของเลเวลปัจจุบัน',
    notes: 'ไม่ได้ EXP ถ้าได้ Soggy Boot — ประมาณ 11,196 ครั้งถึง max level',
  },
  {
    id: 'codes',
    name: 'Codes',
    nameTh: 'โค้ด',
    kind: 'code',
    description: 'โค้ดบางตัวให้ EXP หรือ 2x EXP Boost',
  },
  {
    id: 'shop-2x-exp',
    name: '2x EXP Boost (Shop)',
    nameTh: 'บูสต์ EXP 2 เท่า (ร้าน)',
    kind: 'shop-boost',
    description: 'ซื้อจากร้าน — คูณ EXP ที่ได้เป็น 2 เท่า',
    notes: 'ซ้อน boost ได้แค่เพิ่มเวลา ไม่เพิ่มตัวคูณ',
  },
] as const;
