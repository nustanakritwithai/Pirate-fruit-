import { WORLD_POIS } from '../world/WorldPOI';

export interface NPCDefinition {
  id: string;
  name: string;
  role: string;
  x: number;
  z: number;
  color: number;
  dialogue: string[];
  action?: 'boat-shop' | 'quest-board' | 'dealer-shop';
}

export const STARTER_NPCS: NPCDefinition[] = [
  {
    id: 'village-chief-mali',
    name: 'หัวหน้ามะลิ',
    role: 'ผู้นำหมู่บ้าน',
    x: WORLD_POIS.village.x + 2.5,
    z: WORLD_POIS.village.z + 4,
    color: 0x2d7694,
    action: 'quest-board',
    dialogue: [
      'ยินดีต้อนรับสู่เกาะเริ่มต้น นักเดินทาง! ที่นี่คือที่พักของเหล่าโจรสลัดฝึกหัด',
      'ลองสำรวจหาดฝึกฝน สวนผลไม้ลึกลับ และท่าเรือให้ทั่ว ก่อนออกเดินทางสู่ทะเลใหญ่',
      'เลือกงานที่เหมาะกับระดับของเจ้า แล้วกลับมารับงานใหม่ได้เมื่อทำสำเร็จ',
    ],
  },
  {
    id: 'harbor-master-kram',
    name: 'กัปตันคราม',
    role: 'นายท่า',
    x: 0.9,
    z: -31,
    color: 0x8b4c36,
    action: 'boat-shop',
    dialogue: [
      'อู่เรือเปิดแล้ว! ข้ามีเรือพายฝึกหัดให้เจ้ารับฟรีหนึ่งลำ',
      'เรียกเรือข้างท่า แล้วเดินไปกดขึ้นเรือ ใช้จอยหรือ WASD เพื่อควบคุม',
      'เรือทุกลำมีความเร็วและ HP ของตัวเอง ระวังอย่าพุ่งชนเกาะแรงเกินไป',
    ],
  },
  {
    id: 'fruit-researcher-lin',
    name: 'หลิน',
    role: 'ดีลเลอร์ผลไม้ปีศาจ',
    x: WORLD_POIS.fruitGrove.x - 3,
    z: WORLD_POIS.fruitGrove.z + 1,
    color: 0x78489b,
    action: 'dealer-shop',
    dialogue: [
      'ต้นไม้เรืองแสงต้นนี้ให้ผลที่มีพลังประหลาด และข้าสกัดพลังมันมาใส่กล่องสุ่มได้แล้ว!',
      'จ่ายเหรียญเพื่อสุ่มดาบ ปืน สไตล์ต่อสู้ หรือผลไม้ปีศาจ แต่ละชิ้นมีชุดสกิลของตัวเอง',
      'ติดตั้งอาวุธ 1 อย่างและผลไม้ 1 ลูก แล้วกดปุ่มสลับ (R) เพื่อสลับชุดสกิลระหว่างสองอย่าง',
    ],
  },
  {
    id: 'shopkeeper-pao',
    name: 'เถ้าแก่เปา',
    role: 'ร้านค้าทั่วไป',
    x: 7,
    z: 8.5,
    color: 0xa67935,
    dialogue: [
      'ร้านยังจัดของไม่เสร็จ วันนี้เดินชมหมู่บ้านไปก่อนนะ',
      'ต่อไปที่นี่จะขายของใช้ ยาฟื้นพลัง และอุปกรณ์สำหรับออกทะเล',
    ],
  },
];
