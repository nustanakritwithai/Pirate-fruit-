import { BOAT_PROGRESSION_DEFINITIONS } from '@pirate-fruit/shared';

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
    price: BOAT_PROGRESSION_DEFINITIONS['training-dinghy'].price,
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
    upgradeCosts: BOAT_PROGRESSION_DEFINITIONS['training-dinghy'].upgradeCosts,
  },
  {
    id: 'swift-sloop',
    name: 'เรือใบวายุ',
    description: 'เรือใบขนาดเล็กที่เร็วและเลี้ยวคล่อง แต่รับแรงกระแทกได้น้อยกว่า',
    price: BOAT_PROGRESSION_DEFINITIONS['swift-sloop'].price,
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
    upgradeCosts: BOAT_PROGRESSION_DEFINITIONS['swift-sloop'].upgradeCosts,
  },
  {
    id: 'merchant-brig',
    name: 'เรือพาณิชย์คาราวาน',
    description: 'เรือสองเสากลางลำสำหรับขนของและเดินทางไกล มีดาดฟ้ากว้างสำหรับลูกเรือ',
    price: BOAT_PROGRESSION_DEFINITIONS['merchant-brig'].price,
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
    upgradeCosts: BOAT_PROGRESSION_DEFINITIONS['merchant-brig'].upgradeCosts,
  },
  {
    id: 'war-galleon',
    name: 'เรือรบแกลเลียน',
    description: 'เรือใหญ่สำหรับการรบและ Boarding ดาดฟ้ากว้าง ปืนหนัก และทนการระเบิด',
    price: BOAT_PROGRESSION_DEFINITIONS['war-galleon'].price,
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
    upgradeCosts: BOAT_PROGRESSION_DEFINITIONS['war-galleon'].upgradeCosts,
  },
  {
    id: 'viking-raider',
    name: 'เรือจู่โจมไวกิ้ง',
    description: 'เรือจู่โจมเร็วสำหรับเข้าประชิดและ Boarding มีพื้นที่เดินรอบลำเรือ',
    price: BOAT_PROGRESSION_DEFINITIONS['viking-raider'].price,
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
    upgradeCosts: BOAT_PROGRESSION_DEFINITIONS['viking-raider'].upgradeCosts,
  },
];

export function getBoatDefinition(id: string): BoatDefinition | undefined {
  return BOAT_DEFINITIONS.find((boat) => boat.id === id);
}
