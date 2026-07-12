/** ข้อมูลอาวุธและสกิลของผู้เล่น (Phase 5 — Combat) */

export interface WeaponDefinition {
  id: 'fist' | 'sword';
  name: string;
  icon: string;
  damage: number;
  range: number;
  arcDeg: number;
  cooldown: number;
  /** ตัวคูณดาเมจต่อจังหวะคอมโบ (จังหวะสุดท้าย = ท่าไม้ตายของคอมโบ) */
  comboMultipliers: number[];
  /** แรงผลักตอนจังหวะสุดท้ายของคอมโบ */
  finisherKnockback: number;
  color: number;
}

export const WEAPONS: WeaponDefinition[] = [
  {
    id: 'fist',
    name: 'หมัด',
    icon: '👊',
    damage: 20,
    range: 2.6,
    arcDeg: 150,
    cooldown: 0.42,
    comboMultipliers: [1, 1.15, 1.7],
    finisherKnockback: 8,
    color: 0xffcf8e,
  },
  {
    id: 'sword',
    name: 'ดาบ',
    icon: '🗡️',
    damage: 32,
    range: 3.4,
    arcDeg: 160,
    cooldown: 0.55,
    comboMultipliers: [1, 1.1, 1.6],
    finisherKnockback: 10,
    color: 0x9fdcff,
  },
];

/** หน้าต่างเวลาต่อคอมโบ (วินาที) นับจากการโจมตีครั้งก่อน */
export const COMBO_WINDOW = 1.15;

export interface SkillDefinition {
  id: string;
  name: string;
  icon: string;
  cooldown: number;
  energyCost: number;
  damage: number;
}

export const SKILLS: SkillDefinition[] = [
  {
    id: 'wave-slash',
    name: 'ฟันคลื่น',
    icon: '🌊',
    cooldown: 5,
    energyCost: 18,
    damage: 55,
  },
  {
    id: 'moon-spin',
    name: 'วงจันทร์',
    icon: '🌀',
    cooldown: 8,
    energyCost: 22,
    damage: 45,
  },
  {
    id: 'lunge-strike',
    name: 'พุ่งฟัน',
    icon: '⚡',
    cooldown: 10,
    energyCost: 25,
    damage: 65,
  },
];

// พารามิเตอร์เฉพาะสกิล
export const WAVE_SPEED = 17;
export const WAVE_LIFETIME = 1.05;
export const WAVE_HIT_RADIUS = 1.8;
export const SPIN_RADIUS = 4.6;
export const SPIN_KNOCKBACK = 10;
export const LUNGE_DISTANCE = 7;
export const LUNGE_DURATION = 0.22;
export const LUNGE_HIT_RADIUS = 2.3;

/** Block: ลดดาเมจเหลือสัดส่วนนี้ และกินพลังงานต่อครั้งที่กันได้ */
export const BLOCK_DAMAGE_RATIO = 0.3;
export const BLOCK_ENERGY_COST = 7;

/** ฟื้น HP นอกการต่อสู้ */
export const REGEN_DELAY = 6;
export const REGEN_RATE = 3.5;
