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
  },
];

export function getBoatDefinition(id: string): BoatDefinition | undefined {
  return BOAT_DEFINITIONS.find((boat) => boat.id === id);
}
