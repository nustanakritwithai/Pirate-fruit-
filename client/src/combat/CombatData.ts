/**
 * ข้อมูลกลางของ Combat Framework (Phase 5)
 * data-driven ทั้งหมด: เพิ่มอาวุธ/สกิลใหม่ได้โดยไม่แก้ combat core
 */

export type LoadoutCategory = 'style' | 'sword' | 'gun' | 'fruit' | 'utility';

/** หนึ่งจังหวะของคอมโบ M1 */
export interface ComboHit {
  /** ตัวคูณดาเมจจากดาเมจฐานของอาวุธ */
  multiplier: number;
  /** เวลาง้างก่อน hitbox เกิด (animation event) */
  windup: number;
  /** เวลาหลังตีก่อนรับคำสั่งถัดไป */
  recovery: number;
  /** สัดส่วนความเร็วเดินระหว่างง้าง+ตี (0 = ล็อกอยู่กับที่, 1 = เดินปกติ) */
  movementLock: number;
  /** แรงผลักศัตรู */
  knockback: number;
}

/** ของที่ใส่ในช่อง Loadout ได้ (ตอนนี้มี style/sword — โครงรองรับ gun/fruit/utility แล้ว) */
export interface LoadoutItemDefinition {
  id: string;
  category: LoadoutCategory;
  name: string;
  icon: string;
  damage: number;
  range: number;
  arcDeg: number;
  combo: ComboHit[];
  color: number;
}

export const LOADOUT_ITEMS: Record<string, LoadoutItemDefinition> = {
  'basic-brawl': {
    id: 'basic-brawl',
    category: 'style',
    name: 'หมัดพื้นฐาน',
    icon: '👊',
    damage: 20,
    range: 2.6,
    arcDeg: 150,
    color: 0xffcf8e,
    // หมัด: เร็ว 4 จังหวะ จบด้วยฮุคหนัก
    combo: [
      { multiplier: 1.0, windup: 0.1, recovery: 0.3, movementLock: 0.35, knockback: 1.5 },
      { multiplier: 1.05, windup: 0.1, recovery: 0.3, movementLock: 0.35, knockback: 1.5 },
      { multiplier: 1.15, windup: 0.12, recovery: 0.34, movementLock: 0.3, knockback: 2.5 },
      { multiplier: 1.75, windup: 0.18, recovery: 0.55, movementLock: 0, knockback: 9 },
    ],
  },
  'training-sword': {
    id: 'training-sword',
    category: 'sword',
    name: 'ดาบฝึกหัด',
    icon: '🗡️',
    damage: 32,
    range: 3.4,
    arcDeg: 160,
    color: 0x9fdcff,
    // ดาบ: ช้ากว่า แรงกว่า ไกลกว่า
    combo: [
      { multiplier: 1.0, windup: 0.14, recovery: 0.38, movementLock: 0.25, knockback: 2 },
      { multiplier: 1.1, windup: 0.14, recovery: 0.38, movementLock: 0.25, knockback: 2 },
      { multiplier: 1.2, windup: 0.16, recovery: 0.42, movementLock: 0.2, knockback: 3 },
      { multiplier: 1.7, windup: 0.24, recovery: 0.65, movementLock: 0, knockback: 11 },
    ],
  },
};

/** หน้าต่างเวลาต่อคอมโบ (วินาที) นับจากจังหวะก่อนหน้าจบ */
export const COMBO_WINDOW = 1.2;

/** นิยามสกิลตามสเปก Combat Framework — เพิ่มสกิลใหม่ได้โดยไม่แตะ combat core */
export interface SkillDefinition {
  id: string;
  category: LoadoutCategory;
  /** Mastery ขั้นต่ำของของชิ้นนั้น (ระบบ Mastery จริงมาใน Phase 6 — ตอนนี้ 0 = ใช้ได้เลย) */
  masteryRequired: number;
  cooldown: number;
  energyCost: number;
  /** เวลาร่าย (เข้า state casting ล็อกการเดิน) ก่อนผลออก */
  castTime: number;
  damage: number;
  range: number;
  radius: number;
  tags: string[];
  // ข้อมูลแสดงผล
  name: string;
  icon: string;
}

export const SKILLS: SkillDefinition[] = [
  {
    id: 'wave-slash',
    category: 'style',
    masteryRequired: 0,
    cooldown: 5,
    energyCost: 18,
    castTime: 0.15,
    damage: 55,
    range: 18,
    radius: 1.8,
    tags: ['projectile', 'knockback-light'],
    name: 'ฟันคลื่น',
    icon: '🌊',
  },
  {
    id: 'moon-spin',
    category: 'style',
    masteryRequired: 0,
    cooldown: 8,
    energyCost: 22,
    castTime: 0.25,
    damage: 45,
    range: 0,
    radius: 4.6,
    tags: ['aoe', 'knockback-heavy'],
    name: 'วงจันทร์',
    icon: '🌀',
  },
  {
    id: 'lunge-strike',
    category: 'style',
    masteryRequired: 0,
    cooldown: 10,
    energyCost: 25,
    castTime: 0.18,
    damage: 65,
    range: 7,
    radius: 2.3,
    tags: ['dash', 'line'],
    name: 'พุ่งฟัน',
    icon: '⚡',
  },
];

// ---------- พารามิเตอร์เฉพาะสกิล ----------
export const WAVE_SPEED = 17;
export const WAVE_LIFETIME = 1.05;
export const LUNGE_DURATION = 0.22;

// ---------- Guard (Block) ----------
export const GUARD_MAX = 100;
/** ดาเมจที่บล็อกได้กิน guard เท่าจำนวนดาเมจดิบ x ค่านี้ */
export const GUARD_DAMAGE_FACTOR = 1.4;
/** guard ฟื้นต่อวินาที (เฉพาะตอนไม่ได้บล็อก) */
export const GUARD_REGEN = 14;
/** ดาเมจที่เหลือหลังบล็อกสำเร็จ */
export const BLOCK_DAMAGE_RATIO = 0.25;
/** guard หมด → โดนสตันนานเท่านี้ + บล็อกไม่ได้จนกว่า guard ฟื้นถึง threshold */
export const GUARD_BREAK_STUN = 1.6;
export const GUARD_REBLOCK_THRESHOLD = 30;

// ---------- สถานะโดนตีของผู้เล่น ----------
export const PLAYER_KNOCKBACK_SPEED = 9;
export const PLAYER_KNOCKBACK_DURATION = 0.22;
export const KNOCKDOWN_STUN = 1.2;

// ---------- ฟื้น HP นอกการต่อสู้ ----------
export const REGEN_DELAY = 6;
export const REGEN_RATE = 3.5;
