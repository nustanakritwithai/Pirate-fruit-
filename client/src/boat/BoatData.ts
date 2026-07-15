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
}

/**
 * เกียร์ใบเรือ 4 ระดับ (0 = เก็บใบ … 3 = เต็มใบ) → สัดส่วนของ maxSpeed
 * ช่วงล่างถ่างกว่าเดิมให้เกียร์ 1-2 รู้สึกช้าแบบเรือใบรับลมบางส่วน
 */
export const SAIL_GEAR_RATIO = [0, 0.3, 0.6, 1] as const;
export const MAX_SAIL_LEVEL = SAIL_GEAR_RATIO.length - 1;

export const BOAT_DEFINITIONS: BoatDefinition[] = [
  {
    id: 'training-dinghy',
    name: 'เรือพายฝึกหัด',
    description: 'เรือฟรีสำหรับเรียนรู้การเดินทะเล ควบคุมง่ายและทนทาน',
    price: 0,
    maxSpeed: 7,
    acceleration: 2.6,
    reverseSpeed: 2.6,
    turnSpeed: 1.05,
    brakePower: 7,
    drag: 0.5,
    maxHp: 130,
    collisionRadius: 2.6,
    length: 5.2,
    width: 2.1,
    hasSail: false,
    color: 0x704226,
    cannonsPerSide: 1,
  },
  {
    id: 'swift-sloop',
    name: 'เรือใบวายุ',
    description: 'เรือใบขนาดเล็กที่เร็วและเลี้ยวคล่อง แต่รับแรงกระแทกได้น้อยกว่า',
    price: 500,
    maxSpeed: 12,
    acceleration: 2.4,
    reverseSpeed: 3,
    turnSpeed: 1.2,
    brakePower: 8,
    drag: 0.4,
    maxHp: 100,
    collisionRadius: 3,
    length: 6.2,
    width: 2.35,
    hasSail: true,
    color: 0x8b3929,
    cannonsPerSide: 2,
  },
];

export function getBoatDefinition(id: string): BoatDefinition | undefined {
  return BOAT_DEFINITIONS.find((boat) => boat.id === id);
}
