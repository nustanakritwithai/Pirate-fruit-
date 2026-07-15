export type BoatUpgradeKind = 'hull' | 'cannon' | 'sail';

export interface BoatUpgradeCosts {
  hull: readonly number[];
  cannon: readonly number[];
  sail: readonly number[];
}

export interface BoatDefinition {
  id: string;
  name: string;
  description: string;
  price: number;
  maxSpeed: number;
  acceleration: number;
  reverseSpeed: number;
  turnSpeed: number;
  brakePower: number;
  drag: number;
  maxHp: number;
  collisionRadius: number;
  length: number;
  width: number;
  hasSail: boolean;
  color: number;
  /** จำนวนปืนใหญ่ต่อกราบ (ซ้าย/ขวา) — 0/ไม่ระบุ = ไม่มีปืน */
  cannonsPerSide?: number;
  /** โมเดลเรือจาก asset library */
  modelId?: 'boat' | 'small-ship' | 'sail-ship' | 'ship' | 'viking-boat' | 'sail-boat';
  deckTopLocalY?: number;
  upgradeCosts?: BoatUpgradeCosts;
}

/** เกียร์ใบเรือ 4 ระดับ (0 = เก็บใบ … 3 = เต็มใบ) → สัดส่วนของ maxSpeed */
export const SAIL_GEAR_RATIO = [0, 0.35, 0.7, 1] as const;
export const MAX_SAIL_LEVEL = SAIL_GEAR_RATIO.length - 1;

export const BOAT_DEFINITIONS: BoatDefinition[] = [
  {
    id: 'training-dinghy',
    name: 'เรือพายฝึกหัด',
    description: 'เรือฟรีสำหรับเรียนรู้การเดินทะเล ควบคุมง่ายและทนทาน',
    price: 0,
    maxSpeed: 9,
    acceleration: 4.8,
    reverseSpeed: 3.2,
    turnSpeed: 1.35,
    brakePower: 7,
    drag: 0.72,
    maxHp: 130,
    collisionRadius: 2.6,
    length: 5.2,
    width: 2.1,
    hasSail: false,
    color: 0x704226,
    cannonsPerSide: 1,
    modelId: 'boat',
    deckTopLocalY: 0.88,
    upgradeCosts: { hull: [250, 500, 900], cannon: [300, 650], sail: [220, 450] },
  },
  {
    id: 'swift-sloop',
    name: 'เรือใบวายุ',
    description: 'เรือใบขนาดเล็กที่เร็วและเลี้ยวคล่อง แต่รับแรงกระแทกได้น้อยกว่า',
    price: 500,
    maxSpeed: 14,
    acceleration: 6.2,
    reverseSpeed: 3.8,
    turnSpeed: 1.55,
    brakePower: 8,
    drag: 0.58,
    maxHp: 100,
    collisionRadius: 3,
    length: 6.2,
    width: 2.35,
    hasSail: true,
    color: 0x8b3929,
    cannonsPerSide: 2,
    modelId: 'sail-boat',
    deckTopLocalY: 0.92,
    upgradeCosts: { hull: [400, 800, 1400], cannon: [450, 900, 1600], sail: [350, 700] },
  },
  {
    id: 'merchant-brig',
    name: 'เรือพาณิชย์คาราวาน',
    description: 'เรือสองเสากลางลำสำหรับขนของและเดินทางไกล มีดาดฟ้ากว้างสำหรับลูกเรือ',
    price: 2400,
    maxSpeed: 11,
    acceleration: 3.8,
    reverseSpeed: 2.8,
    turnSpeed: 0.95,
    brakePower: 7,
    drag: 0.48,
    maxHp: 360,
    collisionRadius: 4.8,
    length: 10.5,
    width: 4.1,
    hasSail: true,
    color: 0x9a5b32,
    cannonsPerSide: 3,
    modelId: 'sail-ship',
    deckTopLocalY: 1.18,
    upgradeCosts: { hull: [900, 1600, 2600], cannon: [800, 1500, 2600], sail: [700, 1300] },
  },
  {
    id: 'war-galleon',
    name: 'เรือรบแกลเลียน',
    description: 'เรือใหญ่สำหรับการรบและ Boarding ดาดฟ้ากว้าง ปืนหนัก และทนการระเบิด',
    price: 6500,
    maxSpeed: 9,
    acceleration: 2.8,
    reverseSpeed: 2.2,
    turnSpeed: 0.68,
    brakePower: 8,
    drag: 0.42,
    maxHp: 720,
    collisionRadius: 6.5,
    length: 15,
    width: 5.8,
    hasSail: true,
    color: 0x4b3024,
    cannonsPerSide: 5,
    modelId: 'ship',
    deckTopLocalY: 1.35,
    upgradeCosts: { hull: [1800, 3200, 5200], cannon: [1600, 3000, 4800], sail: [1200, 2400] },
  },
  {
    id: 'viking-raider',
    name: 'เรือจู่โจมไวกิ้ง',
    description: 'เรือจู่โจมเร็วสำหรับเข้าประชิดและ Boarding มีพื้นที่เดินรอบลำเรือ',
    price: 4200,
    maxSpeed: 13,
    acceleration: 4.5,
    reverseSpeed: 3,
    turnSpeed: 1.05,
    brakePower: 7,
    drag: 0.5,
    maxHp: 440,
    collisionRadius: 5.2,
    length: 12,
    width: 4.4,
    hasSail: true,
    color: 0x6e3b26,
    cannonsPerSide: 3,
    modelId: 'viking-boat',
    deckTopLocalY: 1.08,
    upgradeCosts: { hull: [1100, 1900, 3200], cannon: [900, 1700, 2800], sail: [750, 1400] },
  },
];

export function getBoatDefinition(id: string): BoatDefinition | undefined {
  return BOAT_DEFINITIONS.find((boat) => boat.id === id);
}
