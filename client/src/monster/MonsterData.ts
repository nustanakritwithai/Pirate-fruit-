/** ชนิดของมอนสเตอร์และแคมป์ที่เกิดบนเกาะ (Phase 4) */

export type MonsterKind = 'crab' | 'grunt' | 'boss';

/** ท่าโจมตีหนักพิเศษ (มี telegraph ก่อนปล่อย) */
export interface HeavyAttackDefinition {
  /** ปล่อยทุกการโจมตีครั้งที่ N */
  everyNth: number;
  /** ตัวคูณดาเมจจากดาเมจปกติ */
  multiplier: number;
  /** เวลาง้าง (ตัวมอนแฟลชเตือน) ก่อนตีจริง */
  telegraph: number;
  /** แรงผลักผู้เล่น */
  knockback: number;
  /** เช่น 'unblockable' (ทะลุ Block), 'knockdown' (ล้มนาน) */
  tags: string[];
}

export interface MonsterType {
  id: string;
  name: string;
  kind: MonsterKind;
  level: number;
  maxHp: number;
  damage: number;
  moveSpeed: number; // m/s
  aggroRange: number; // ระยะเริ่มไล่
  attackRange: number; // ระยะเข้าตี
  attackCooldown: number; // วินาที
  scale: number;
  color: number;
  xp: number; // เผื่อ Phase 6 (ระบบเลเวล)
  heavyAttack?: HeavyAttackDefinition;
}

export const MONSTER_TYPES: Record<string, MonsterType> = {
  crab: {
    id: 'crab',
    name: 'ปูทะเลดุ',
    kind: 'crab',
    level: 2,
    maxHp: 70,
    damage: 7,
    moveSpeed: 2.6,
    aggroRange: 12,
    attackRange: 2.2,
    attackCooldown: 1.3,
    scale: 1,
    color: 0xcf5a38,
    xp: 12,
  },
  grunt: {
    id: 'grunt',
    name: 'โจรสลัดเร่ร่อน',
    kind: 'grunt',
    level: 4,
    maxHp: 95,
    damage: 10,
    moveSpeed: 3.2,
    aggroRange: 15,
    attackRange: 2,
    attackCooldown: 1.1,
    scale: 1.1,
    color: 0x6f7f3a,
    xp: 20,
  },
  boss: {
    id: 'boss',
    name: 'กัปตันหนวดดำ',
    kind: 'boss',
    level: 10,
    maxHp: 680,
    damage: 20,
    moveSpeed: 2.7,
    aggroRange: 24,
    attackRange: 2.8,
    attackCooldown: 1.4,
    scale: 1.9,
    color: 0x3a2b45,
    xp: 300,
    // ทุกตีครั้งที่ 3: ฟาดหนัก ทะลุ Block + ผลักผู้เล่นล้ม (มีแฟลชเตือน 0.6 วิ)
    heavyAttack: {
      everyNth: 3,
      multiplier: 1.6,
      telegraph: 0.6,
      knockback: 11,
      tags: ['unblockable', 'knockdown'],
    },
  },
};

export interface MonsterCamp {
  id: string;
  name: string;
  typeId: string;
  x: number;
  z: number;
  radius: number;
  count: number;
  recommendedLevel: number;
}

/** แคมป์มอนสเตอร์วางบนพื้นดินฝั่งตะวันออกของเกาะ นอกเขตปลอดภัยหมู่บ้าน */
export const MONSTER_CAMPS: MonsterCamp[] = [
  { id: 'east-forest', name: 'ชายป่าตะวันออก', typeId: 'crab', x: 22, z: -4, radius: 5, count: 3, recommendedLevel: 2 },
  { id: 'outpost', name: 'ด่านหน้า', typeId: 'crab', x: 16, z: -10, radius: 4, count: 2, recommendedLevel: 2 },
  { id: 'stone-hill', name: 'เนินหิน', typeId: 'grunt', x: 24, z: 8, radius: 5, count: 3, recommendedLevel: 4 },
];

/** บอสประจำเกาะ ยืนเฝ้าเนินตะวันออก */
export const BOSS_SPAWN = { typeId: 'boss', x: 24, z: 4 };
