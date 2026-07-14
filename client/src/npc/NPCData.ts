import { WORLD_POIS } from '../world/WorldPOI';

export interface NPCDefinition {
  id: string;
  islandId: 'starter-island' | 'mist-jungle';
  name: string;
  role: string;
  x: number;
  z: number;
  color: number;
  dialogue: string[];
  action?: 'boat-shop' | 'quest-board' | 'dealer-shop';
  dockId?: string;
}

export const STARTER_NPCS: NPCDefinition[] = [
  {
    id: 'village-chief-mali',
    islandId: 'starter-island',
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
    islandId: 'starter-island',
    name: 'กัปตันคราม',
    role: 'นายท่า',
    x: 0.9,
    z: -31,
    color: 0x8b4c36,
    action: 'boat-shop',
    dockId: 'starter-harbor',
    dialogue: [
      'อู่เรือเปิดแล้ว! ข้ามีเรือพายฝึกหัดให้เจ้ารับฟรีหนึ่งลำ',
      'เรียกเรือข้างท่า แล้วเดินไปกดขึ้นเรือ ใช้จอยหรือ WASD เพื่อควบคุม',
      'เรือทุกลำมีความเร็วและ HP ของตัวเอง ระวังอย่าพุ่งชนเกาะแรงเกินไป',
    ],
  },
  {
    id: 'fruit-researcher-lin',
    islandId: 'starter-island',
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
    islandId: 'starter-island',
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

export const MIST_JUNGLE_NPCS: NPCDefinition[] = [
  {
    id: 'explorer-dara',
    islandId: 'mist-jungle',
    name: 'ดารา',
    role: 'หัวหน้าคณะสำรวจ',
    x: 153,
    z: -37,
    color: 0x327a68,
    action: 'quest-board',
    dialogue: [
      'ยินดีต้อนรับสู่เกาะพงไพรหมอก ที่นี่เหมาะกับนักเดินทาง Level 15 ขึ้นไป',
      'โจรป่ายึดทางใต้ ส่วนผู้พิทักษ์ศิลาคอยเฝ้าซากวิหารด้านตะวันออก',
      'ลึกเข้าไปทางเหนือมีวานรพิษโบราณ อย่าเข้าใกล้ถ้ายังไม่พร้อมรับท่าหนักของมัน',
    ],
  },
  {
    id: 'harbor-master-niran',
    islandId: 'mist-jungle',
    name: 'นิรันดร์',
    role: 'นายท่าคณะสำรวจ',
    x: 139,
    z: -36.8,
    color: 0x80543a,
    action: 'boat-shop',
    dockId: 'mist-jungle-harbor',
    dialogue: [
      'ถึงท่าพงไพรหมอกอย่างปลอดภัยแล้วสินะ เรือของเจ้าสามารถเรียกจากท่านี้ได้',
      'ทางกลับเกาะเริ่มต้นอยู่ตรงตะวันตก แล่นตามช่องทะเลไปจนเห็นหมู่บ้าน',
      'ถ้าตายหรือตกทะเลหลังขึ้นฝั่ง เจ้าจะกลับมาเกิดที่ค่ายนักสำรวจ',
    ],
  },
  {
    id: 'archaeologist-wan',
    islandId: 'mist-jungle',
    name: 'ว่าน',
    role: 'นักโบราณคดี',
    x: 173,
    z: -31,
    color: 0x6d628e,
    dialogue: [
      'เสาหินเหล่านี้เก่าแก่กว่าหมู่บ้านโจรสลัดหลายร้อยปี รอยสลักกล่าวถึงผู้พิทักษ์แห่งหมอก',
      'ผู้พิทักษ์ศิลาตื่นขึ้นเมื่อมีคนบุกรุก ส่วนวานรพิษน่าจะเป็นสิ่งมีชีวิตที่เฝ้าผนึกด้านใน',
    ],
  },
  {
    id: 'field-medic-sai',
    islandId: 'mist-jungle',
    name: 'สาย',
    role: 'แพทย์สนาม',
    x: 157,
    z: -43,
    color: 0x8a3653,
    dialogue: [
      'พักในวงเขียวของค่ายก่อนออกล่า พื้นที่ด้านนอกมีศัตรูแข็งแกร่งกว่าเกาะแรกมาก',
      'เตรียมค่าสถานะ Vitality และอุปกรณ์ที่มี Mastery ให้พร้อมก่อนสู้บอส',
    ],
  },
];

export const ALL_NPCS: NPCDefinition[] = [...STARTER_NPCS, ...MIST_JUNGLE_NPCS];
