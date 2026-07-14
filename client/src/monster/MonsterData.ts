import type { EnemyRewardDefinition } from '../progression/ProgressionTypes';

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
  reward: EnemyRewardDefinition;
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
    reward: { playerExp: 30, masteryExp: 18, coins: 12 },
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
    reward: { playerExp: 55, masteryExp: 30, coins: 24 },
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
    reward: { playerExp: 300, masteryExp: 150, coins: 180 },
    // ทุกตีครั้งที่ 3: ฟาดหนัก ทะลุ Block + ผลักผู้เล่นล้ม (มีแฟลชเตือน 0.6 วิ)
    heavyAttack: {
      everyNth: 3,
      multiplier: 1.6,
      telegraph: 0.6,
      knockback: 11,
      tags: ['unblockable', 'knockdown'],
    },
  },
  'jungle-bandit': {
    id: 'jungle-bandit',
    name: 'โจรป่าพงไพร',
    kind: 'grunt',
    level: 16,
    maxHp: 240,
    damage: 17,
    moveSpeed: 3.5,
    aggroRange: 16,
    attackRange: 2.1,
    attackCooldown: 1.05,
    scale: 1.16,
    color: 0x315c3d,
    reward: { playerExp: 120, masteryExp: 55, coins: 70 },
  },
  'ruin-guardian': {
    id: 'ruin-guardian',
    name: 'ผู้พิทักษ์ศิลา',
    kind: 'grunt',
    level: 22,
    maxHp: 420,
    damage: 24,
    moveSpeed: 2.8,
    aggroRange: 17,
    attackRange: 2.35,
    attackCooldown: 1.25,
    scale: 1.38,
    color: 0x657467,
    reward: { playerExp: 210, masteryExp: 95, coins: 135 },
  },
  'venom-ape-boss': {
    id: 'venom-ape-boss',
    name: 'วานรพิษโบราณ',
    kind: 'boss',
    level: 28,
    maxHp: 1800,
    damage: 36,
    moveSpeed: 3,
    aggroRange: 25,
    attackRange: 3.1,
    attackCooldown: 1.35,
    scale: 2.15,
    color: 0x28483a,
    reward: { playerExp: 1000, masteryExp: 450, coins: 800 },
    heavyAttack: {
      everyNth: 3,
      multiplier: 1.7,
      telegraph: 0.72,
      knockback: 13,
      tags: ['unblockable', 'knockdown'],
    },
  },
};

export interface MonsterCamp {
  id: string;
  islandId: 'starter-island' | 'mist-jungle';
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
  { id: 'east-forest', islandId: 'starter-island', name: 'ชายป่าตะวันออก', typeId: 'crab', x: 22, z: -4, radius: 5, count: 3, recommendedLevel: 2 },
  { id: 'outpost', islandId: 'starter-island', name: 'ด่านหน้า', typeId: 'crab', x: 16, z: -10, radius: 4, count: 2, recommendedLevel: 2 },
  { id: 'stone-hill', islandId: 'starter-island', name: 'เนินหิน', typeId: 'grunt', x: 24, z: 8, radius: 5, count: 3, recommendedLevel: 4 },
  { id: 'jungle-south-camp', islandId: 'mist-jungle', name: 'ค่ายโจรป่าทางใต้', typeId: 'jungle-bandit', x: 170, z: -58, radius: 6, count: 4, recommendedLevel: 16 },
  { id: 'jungle-west-patrol', islandId: 'mist-jungle', name: 'กองลาดตระเวนตะวันตก', typeId: 'jungle-bandit', x: 161, z: -55, radius: 4.5, count: 3, recommendedLevel: 16 },
  { id: 'ruin-sentinels', islandId: 'mist-jungle', name: 'ผู้เฝ้าซากวิหาร', typeId: 'ruin-guardian', x: 183, z: -34, radius: 5.5, count: 3, recommendedLevel: 22 },
  { id: 'guardian-terrace-camp', islandId: 'mist-jungle', name: 'ลานผู้พิทักษ์', typeId: 'ruin-guardian', x: 192, z: -45, radius: 5, count: 3, recommendedLevel: 22 },
];

/** บอสประจำเกาะ ยืนเฝ้าเนินตะวันออก */
export const BOSS_SPAWN = { typeId: 'boss', x: 24, z: 4 };

export interface BossSpawn {
  islandId: 'starter-island' | 'mist-jungle';
  typeId: string;
  x: number;
  z: number;
}

export const BOSS_SPAWNS: readonly BossSpawn[] = [
  { islandId: 'starter-island', ...BOSS_SPAWN },
  { islandId: 'mist-jungle', typeId: 'venom-ape-boss', x: 190, z: -18 },
];
