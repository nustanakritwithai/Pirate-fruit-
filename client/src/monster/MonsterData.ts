import type { EnemyRewardDefinition } from '../progression/ProgressionTypes';
import type { IslandId } from '../island/IslandTypes';

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
  // ---------- ลูกเรือโจรสลัด (Boarding — เกิดบนดาดฟ้าเรือศัตรู ไม่มีแคมป์) ----------
  'pirate-deckhand': {
    id: 'pirate-deckhand',
    name: 'ลูกเรือโจรสลัด',
    kind: 'grunt',
    level: 9,
    maxHp: 150,
    damage: 12,
    moveSpeed: 2.8,
    aggroRange: 14,
    attackRange: 1.9,
    attackCooldown: 1.4,
    scale: 0.98,
    color: 0x424a56,
    reward: { playerExp: 55, masteryExp: 30, coins: 22 },
  },
  'pirate-captain': {
    id: 'pirate-captain',
    name: 'กัปตันหนวดดำ',
    kind: 'grunt',
    level: 11,
    maxHp: 320,
    damage: 18,
    moveSpeed: 3.1,
    aggroRange: 14,
    attackRange: 2.1,
    attackCooldown: 1.6,
    scale: 1.18,
    color: 0x27333e,
    reward: { playerExp: 150, masteryExp: 70, coins: 60 },
    heavyAttack: { everyNth: 3, multiplier: 1.8, telegraph: 0.6, knockback: 7, tags: ['unblockable'] },
  },
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
  'dune-scorpion': {
    id: 'dune-scorpion',
    name: 'แมงป่องเนินทราย',
    kind: 'crab',
    level: 31,
    maxHp: 520,
    damage: 27,
    moveSpeed: 3.4,
    aggroRange: 15,
    attackRange: 2.35,
    attackCooldown: 1.05,
    scale: 1.25,
    color: 0xc18438,
    reward: { playerExp: 260, masteryExp: 120, coins: 160 },
  },
  'desert-raider': {
    id: 'desert-raider',
    name: 'โจรคาราวาน',
    kind: 'grunt',
    level: 34,
    maxHp: 620,
    damage: 30,
    moveSpeed: 3.7,
    aggroRange: 17,
    attackRange: 2.15,
    attackCooldown: 1,
    scale: 1.2,
    color: 0x9a4d34,
    reward: { playerExp: 310, masteryExp: 145, coins: 195 },
  },
  'sand-golem': {
    id: 'sand-golem',
    name: 'โกเลมศิลาทราย',
    kind: 'grunt',
    level: 41,
    maxHp: 880,
    damage: 38,
    moveSpeed: 2.5,
    aggroRange: 18,
    attackRange: 2.65,
    attackCooldown: 1.3,
    scale: 1.62,
    color: 0x9b7b55,
    reward: { playerExp: 430, masteryExp: 200, coins: 280 },
  },
  'sun-guardian-boss': {
    id: 'sun-guardian-boss',
    name: 'ผู้พิทักษ์สุริยะ',
    kind: 'boss',
    level: 48,
    maxHp: 3200,
    damage: 50,
    moveSpeed: 3.1,
    aggroRange: 26,
    attackRange: 3.3,
    attackCooldown: 1.3,
    scale: 2.35,
    color: 0x8c5a2b,
    reward: { playerExp: 1900, masteryExp: 800, coins: 1450 },
    heavyAttack: {
      everyNth: 3,
      multiplier: 1.8,
      telegraph: 0.82,
      knockback: 15,
      tags: ['unblockable', 'knockdown'],
    },
  },
  'frost-crawler': { id: 'frost-crawler', name: 'แมงมุมน้ำแข็ง', kind: 'crab', level: 51, maxHp: 1050, damage: 43, moveSpeed: 3.65, aggroRange: 16, attackRange: 2.45, attackCooldown: 0.98, scale: 1.34, color: 0x74b7cd, reward: { playerExp: 520, masteryExp: 235, coins: 340 } },
  'frost-raider': { id: 'frost-raider', name: 'โจรน้ำแข็ง', kind: 'grunt', level: 55, maxHp: 1260, damage: 48, moveSpeed: 3.75, aggroRange: 18, attackRange: 2.2, attackCooldown: 0.98, scale: 1.24, color: 0x315f80, reward: { playerExp: 620, masteryExp: 280, coins: 420 } },
  'crystal-golem': { id: 'crystal-golem', name: 'โกเลมคริสตัลคราม', kind: 'grunt', level: 62, maxHp: 1680, damage: 58, moveSpeed: 2.55, aggroRange: 19, attackRange: 2.85, attackCooldown: 1.28, scale: 1.72, color: 0x4e91a8, reward: { playerExp: 820, masteryExp: 365, coins: 580 } },
  'frost-king-boss': {
    id: 'frost-king-boss', name: 'ราชันน้ำแข็งโบราณ', kind: 'boss', level: 68,
    maxHp: 5200, damage: 68, moveSpeed: 3.15, aggroRange: 27, attackRange: 3.5,
    attackCooldown: 1.25, scale: 2.5, color: 0x376d86,
    reward: { playerExp: 2900, masteryExp: 1200, coins: 2300 },
    heavyAttack: { everyNth: 3, multiplier: 1.9, telegraph: 0.9, knockback: 17, tags: ['unblockable', 'knockdown'] },
  },
  'cloud-crab': { id: 'cloud-crab', name: 'ปูเมฆสายฟ้า', kind: 'crab', level: 71, maxHp: 2050, damage: 63, moveSpeed: 3.8, aggroRange: 17, attackRange: 2.5, attackCooldown: 0.94, scale: 1.42, color: 0xb9dce7, reward: { playerExp: 980, masteryExp: 430, coins: 700 } },
  'sky-raider': { id: 'sky-raider', name: 'โจรเวหา', kind: 'grunt', level: 75, maxHp: 2380, damage: 69, moveSpeed: 3.95, aggroRange: 19, attackRange: 2.25, attackCooldown: 0.93, scale: 1.28, color: 0x506aa0, reward: { playerExp: 1120, masteryExp: 500, coins: 820 } },
  'storm-golem': { id: 'storm-golem', name: 'โกเลมผลึกพายุ', kind: 'grunt', level: 82, maxHp: 3100, damage: 80, moveSpeed: 2.7, aggroRange: 20, attackRange: 3, attackCooldown: 1.2, scale: 1.82, color: 0x617db5, reward: { playerExp: 1450, masteryExp: 630, coins: 1080 } },
  'tempest-lord-boss': {
    id: 'tempest-lord-boss', name: 'เจ้าแห่งพายุนิรันดร์', kind: 'boss', level: 88,
    maxHp: 8200, damage: 92, moveSpeed: 3.35, aggroRange: 29, attackRange: 3.7,
    attackCooldown: 1.18, scale: 2.65, color: 0x435b93,
    reward: { playerExp: 4300, masteryExp: 1750, coins: 3600 },
    heavyAttack: { everyNth: 3, multiplier: 2, telegraph: 0.95, knockback: 18, tags: ['unblockable', 'knockdown'] },
  },
  'lava-crawler': { id: 'lava-crawler', name: 'ตะขาบลาวา', kind: 'crab', level: 91, maxHp: 3900, damage: 88, moveSpeed: 3.9, aggroRange: 18, attackRange: 2.55, attackCooldown: 0.92, scale: 1.48, color: 0xd55724, reward: { playerExp: 1720, masteryExp: 740, coins: 1320 } },
  'ash-cultist': { id: 'ash-cultist', name: 'สาวกลัทธิเถ้าถ่าน', kind: 'grunt', level: 95, maxHp: 4550, damage: 96, moveSpeed: 4.05, aggroRange: 20, attackRange: 2.3, attackCooldown: 0.9, scale: 1.32, color: 0x713b32, reward: { playerExp: 1980, masteryExp: 850, coins: 1540 } },
  'obsidian-golem': { id: 'obsidian-golem', name: 'โกเลมออบซิเดียน', kind: 'grunt', level: 102, maxHp: 5900, damage: 110, moveSpeed: 2.8, aggroRange: 21, attackRange: 3.1, attackCooldown: 1.16, scale: 1.92, color: 0x332b38, reward: { playerExp: 2550, masteryExp: 1080, coins: 2050 } },
  'magma-titan-boss': {
    id: 'magma-titan-boss', name: 'ไททันแมกมาบรรพกาล', kind: 'boss', level: 108,
    maxHp: 13500, damage: 128, moveSpeed: 3.45, aggroRange: 30, attackRange: 3.9,
    attackCooldown: 1.12, scale: 2.8, color: 0x4b2a2a,
    reward: { playerExp: 6500, masteryExp: 2550, coins: 5400 },
    heavyAttack: { everyNth: 3, multiplier: 2.1, telegraph: 1, knockback: 20, tags: ['unblockable', 'knockdown'] },
  },
};

export interface MonsterCamp {
  id: string;
  islandId: IslandId;
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
  { id: 'oasis-scorpions', islandId: 'sunscar-desert', name: 'รังแมงป่องโอเอซิส', typeId: 'dune-scorpion', x: 151, z: 130, radius: 5.5, count: 4, recommendedLevel: 31 },
  { id: 'east-dune-scorpions', islandId: 'sunscar-desert', name: 'เนินทรายตะวันออก', typeId: 'dune-scorpion', x: 184, z: 125, radius: 5, count: 3, recommendedLevel: 31 },
  { id: 'sunscar-raiders', islandId: 'sunscar-desert', name: 'ค่ายโจรคาราวาน', typeId: 'desert-raider', x: 148, z: 142, radius: 6, count: 4, recommendedLevel: 34 },
  { id: 'sandstone-quarry', islandId: 'sunscar-desert', name: 'เหมืองศิลาทราย', typeId: 'sand-golem', x: 191, z: 141, radius: 5.5, count: 4, recommendedLevel: 41 },
  { id: 'frozen-lake-crawlers', islandId: 'azure-frost', name: 'รังแมงมุมน้ำแข็ง', typeId: 'frost-crawler', x: 28, z: 195, radius: 5.5, count: 4, recommendedLevel: 51 },
  { id: 'south-snow-crawlers', islandId: 'azure-frost', name: 'ชายหิมะใต้', typeId: 'frost-crawler', x: 45, z: 184, radius: 5, count: 3, recommendedLevel: 51 },
  { id: 'azure-frost-raiders', islandId: 'azure-frost', name: 'ค่ายโจรน้ำแข็ง', typeId: 'frost-raider', x: 11, z: 218, radius: 6, count: 4, recommendedLevel: 55 },
  { id: 'azure-crystal-mine', islandId: 'azure-frost', name: 'เหมืองคริสตัลคราม', typeId: 'crystal-golem', x: 47, z: 236, radius: 5.5, count: 4, recommendedLevel: 62 },
  { id: 'cloud-garden-crabs', islandId: 'tempest-sky', name: 'ฝูงปูเมฆ', typeId: 'cloud-crab', x: -124, z: 190, radius: 5.5, count: 4, recommendedLevel: 71 },
  { id: 'east-cloud-crabs', islandId: 'tempest-sky', name: 'ทางเมฆตะวันออก', typeId: 'cloud-crab', x: -111, z: 226, radius: 5, count: 3, recommendedLevel: 71 },
  { id: 'tempest-sky-raiders', islandId: 'tempest-sky', name: 'ค่ายโจรเวหา', typeId: 'sky-raider', x: -145, z: 207, radius: 6, count: 4, recommendedLevel: 75 },
  { id: 'tempest-storm-forge', islandId: 'tempest-sky', name: 'โรงตีผลึกพายุ', typeId: 'storm-golem', x: -124, z: 232, radius: 5.5, count: 4, recommendedLevel: 82 },
  { id: 'ember-lava-crawlers', islandId: 'ember-volcano', name: 'ฝูงตะขาบลาวา', typeId: 'lava-crawler', x: -255, z: 98, radius: 5.5, count: 4, recommendedLevel: 91 },
  { id: 'ember-east-crawlers', islandId: 'ember-volcano', name: 'ทางเถ้าตะวันออก', typeId: 'lava-crawler', x: -204, z: 78, radius: 5, count: 3, recommendedLevel: 91 },
  { id: 'ember-ash-cultists', islandId: 'ember-volcano', name: 'ป้อมลัทธิเถ้าถ่าน', typeId: 'ash-cultist', x: -270, z: 72, radius: 6, count: 4, recommendedLevel: 95 },
  { id: 'ember-obsidian-mine', islandId: 'ember-volcano', name: 'เหมืองออบซิเดียน', typeId: 'obsidian-golem', x: -214, z: 56, radius: 5.5, count: 4, recommendedLevel: 102 },
];

/** บอสประจำเกาะ ยืนเฝ้าเนินตะวันออก */
export const BOSS_SPAWN = { typeId: 'boss', x: 24, z: 4 };

export interface BossSpawn {
  islandId: IslandId;
  typeId: string;
  x: number;
  z: number;
}

export const BOSS_SPAWNS: readonly BossSpawn[] = [
  { islandId: 'starter-island', ...BOSS_SPAWN },
  { islandId: 'mist-jungle', typeId: 'venom-ape-boss', x: 190, z: -18 },
  { islandId: 'sunscar-desert', typeId: 'sun-guardian-boss', x: 170, z: 152 },
  { islandId: 'azure-frost', typeId: 'frost-king-boss', x: 20, z: 244 },
  { islandId: 'tempest-sky', typeId: 'tempest-lord-boss', x: -151, z: 236 },
  { islandId: 'ember-volcano', typeId: 'magma-titan-boss', x: -235, z: 70 },
];
