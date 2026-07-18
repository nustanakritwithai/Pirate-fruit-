/**
 * S16 — Shared Monster & NPC World State (contract กลาง)
 * มอนสเตอร์เป็นสิ่งมีชีวิตเดียวในโลกกลาง: Server จำลอง spawn/AI/HP/death/respawn
 * แล้ว push snapshot + delta ให้ผู้เล่นที่อยู่ในระยะสนใจ (interest) — Client เรนเดอร์ตาม
 *
 * self-contained (ไม่พึ่ง client): พิกัด home เป็น world coords ที่ Server เป็นเจ้าของ
 */

/** สถานะ AI ของมอนสเตอร์ (Server เป็นเจ้าของ) */
export type WorldMonsterState =
  | 'idle'
  | 'patrol'
  | 'aggro'
  | 'chase'
  | 'attack'
  | 'return'
  | 'dead';

export interface SharedMonsterType {
  id: string;
  /** ชนิดสำหรับเลือกโมเดลฝั่ง Client */
  kind: 'crab' | 'grunt' | 'boss';
  level: number;
  maxHp: number;
  damage: number;
  /** m/s */
  moveSpeed: number;
  aggroRange: number;
  attackRange: number;
  /** วินาที */
  attackCooldown: number;
  /** ms หลังตายก่อนเกิดใหม่ */
  respawnMs: number;
}

/** ตารางชนิด (subset ที่ Server จำลอง — id ตรงกับ MONSTER_TYPES ฝั่ง client เพื่อ reuse โมเดล) */
export const SHARED_MONSTER_TYPES: Record<string, SharedMonsterType> = {
  crab: {
    id: 'crab', kind: 'crab', level: 2, maxHp: 70, damage: 7,
    moveSpeed: 2.6, aggroRange: 12, attackRange: 2.2, attackCooldown: 1.3, respawnMs: 15_000,
  },
  grunt: {
    id: 'grunt', kind: 'grunt', level: 4, maxHp: 95, damage: 10,
    moveSpeed: 3.2, aggroRange: 15, attackRange: 2, attackCooldown: 1.1, respawnMs: 18_000,
  },
  boss: {
    id: 'boss', kind: 'boss', level: 10, maxHp: 680, damage: 20,
    moveSpeed: 2.7, aggroRange: 24, attackRange: 2.8, attackCooldown: 1.4, respawnMs: 45_000,
  },
};

export interface SharedSpawnPoint {
  spawnId: string;
  islandId: string;
  monsterId: string;
  /** จุดบ้าน (world coords) — patrol รอบนี้ + return กลับมาที่นี่ */
  homeX: number;
  homeZ: number;
  /** รัศมี patrol/wander รอบบ้าน */
  patrolRadius: number;
}

/**
 * spawn ประจำโลก — starter-island (คุมจำนวนต่อเกาะ; ขยายเกาะอื่นภายหลัง)
 * ตัวเลขเป็น world coords ที่ Server ยึดเป็นความจริง (Client เรนเดอร์ตามที่ Server ส่ง)
 */
export const SHARED_WORLD_SPAWNS: readonly SharedSpawnPoint[] = [
  { spawnId: 'starter-crab-1', islandId: 'starter-island', monsterId: 'crab', homeX: 22, homeZ: -4, patrolRadius: 5 },
  { spawnId: 'starter-crab-2', islandId: 'starter-island', monsterId: 'crab', homeX: 24, homeZ: -6, patrolRadius: 5 },
  { spawnId: 'starter-crab-3', islandId: 'starter-island', monsterId: 'crab', homeX: 20, homeZ: -2, patrolRadius: 5 },
  { spawnId: 'starter-grunt-1', islandId: 'starter-island', monsterId: 'grunt', homeX: 24, homeZ: 8, patrolRadius: 5 },
  { spawnId: 'starter-grunt-2', islandId: 'starter-island', monsterId: 'grunt', homeX: 26, homeZ: 10, patrolRadius: 5 },
  { spawnId: 'starter-grunt-3', islandId: 'starter-island', monsterId: 'grunt', homeX: 22, homeZ: 12, patrolRadius: 5 },
  { spawnId: 'starter-boss', islandId: 'starter-island', monsterId: 'boss', homeX: 24, homeZ: 4, patrolRadius: 3 },
];

/** snapshot ของมอนสเตอร์หนึ่งตัว (Server → Client) */
export interface WorldMonsterSnapshot {
  spawnId: string;
  monsterId: string;
  islandId: string;
  x: number;
  z: number;
  heading: number;
  hp: number;
  maxHp: number;
  state: WorldMonsterState;
}

/** delta ต่อ tick — เฉพาะฟิลด์ที่เปลี่ยนบ่อย (position/hp/state/heading) */
export interface WorldMonsterDelta {
  spawnId: string;
  x: number;
  z: number;
  heading: number;
  hp: number;
  state: WorldMonsterState;
}

/** รอบจำลอง AI ของ Server (5 ครั้ง/วินาที) — คุมต้นทุน */
export const WORLD_MONSTER_TICK_MS = 200;
/** ส่ง full snapshot ซ้ำทุกช่วงนี้ (กันหลุด) นอกเหนือจาก snapshot ตอน join/resync */
export const WORLD_MONSTER_SNAPSHOT_MS = 5_000;
/** ระยะสนใจ: ส่ง delta ให้เฉพาะผู้เล่นที่อยู่ใกล้กว่านี้ (world units) */
export const WORLD_MONSTER_INTEREST_RANGE = 80;
/** ระยะสูงสุดที่นับว่าตีมอนสเตอร์ถึง (วัดจาก presence ผู้เล่น) */
export const WORLD_MONSTER_MELEE_RANGE = 4.5;
export const WORLD_MONSTER_SKILL_RANGE = 24;
/** ดาเมจ PvE คงที่ต่อ hit (Server เป็นเจ้าของ — Client ส่งดาเมจไม่ได้) */
export const WORLD_MONSTER_MELEE_DAMAGE = 12;
export const WORLD_MONSTER_SKILL_DAMAGE = 26;
/** contribution เก่ากว่านี้ถือว่าหมดอายุ (ไม่ร่วมแจกรางวัลใน phase ถัดไป) */
export const WORLD_MONSTER_CONTRIBUTION_WINDOW_MS = 20_000;
