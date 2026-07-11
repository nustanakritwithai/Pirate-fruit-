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
}

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
  },
];

export function getBoatDefinition(id: string): BoatDefinition | undefined {
  return BOAT_DEFINITIONS.find((boat) => boat.id === id);
}
