import type { SeaGateDefinition } from '../types';

/** เกณฑ์เลเวลสำหรับเนื้อหาแต่ละ Sea */
export const SEA_GATES: readonly SeaGateDefinition[] = [
  {
    id: 'second-sea',
    name: 'Second Sea',
    nameTh: 'ทะเลที่ 2',
    requiredLevel: 700,
    wikiCumulativeExp: 3_320_000_000,
    description: 'ต้องเลเวล 700 เพื่อเข้า Second Sea (wiki ระบุ EXP สะสม ~3.32B)',
  },
  {
    id: 'third-sea',
    name: 'Third Sea',
    nameTh: 'ทะเลที่ 3',
    requiredLevel: 1500,
    wikiCumulativeExp: 26_320_000_000,
    description: 'ต้องเลเวล 1500 เพื่อเข้า Third Sea (wiki ระบุ EXP สะสม ~26.32B รวมจากจุดเริ่ม)',
  },
  {
    id: 'max-level',
    name: 'Max Level',
    nameTh: 'เลเวลสูงสุด',
    requiredLevel: 2800,
    wikiCumulativeExp: 143_840_871_332,
    description: 'เลเวลสูงสุดปัจจุบัน — ไม่ได้รับ EXP เพิ่มหลังถึง cap',
  },
] as const;
