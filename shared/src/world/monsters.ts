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
  | 'stunned'
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

/** Delay from the authoritative attack action to its active hit frame. */
export const WORLD_MONSTER_ATTACK_HIT_DELAY_MS = 180;
/** Server-authoritative window during which a confirmed player hit interrupts monster AI. */
export const WORLD_MONSTER_HITSTUN_MS = 450;

/** One authoritative monster attack action (damage is applied only once for this id). */
export interface WorldMonsterAttack {
  attackId: string;
  spawnId: string;
  monsterId: string;
  islandId: string;
  targetId: string;
  action: 'melee';
  damage: number;
  hitDelayMs: number;
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
  // เกาะ 2 — พงไพรหมอก
  'jungle-bandit': { id: 'jungle-bandit', kind: 'grunt', level: 16, maxHp: 240, damage: 17, moveSpeed: 3.5, aggroRange: 16, attackRange: 2.1, attackCooldown: 1.05, respawnMs: 16_000 },
  'ruin-guardian': { id: 'ruin-guardian', kind: 'grunt', level: 22, maxHp: 420, damage: 24, moveSpeed: 2.8, aggroRange: 17, attackRange: 2.35, attackCooldown: 1.25, respawnMs: 18_000 },
  'venom-ape-boss': { id: 'venom-ape-boss', kind: 'boss', level: 28, maxHp: 1800, damage: 36, moveSpeed: 3, aggroRange: 25, attackRange: 3.1, attackCooldown: 1.35, respawnMs: 45_000 },
  // เกาะ 3 — ทะเลทรายสุริยะ
  'dune-scorpion': { id: 'dune-scorpion', kind: 'grunt', level: 31, maxHp: 520, damage: 27, moveSpeed: 3.4, aggroRange: 15, attackRange: 2.35, attackCooldown: 1.05, respawnMs: 16_000 },
  'desert-raider': { id: 'desert-raider', kind: 'grunt', level: 34, maxHp: 620, damage: 30, moveSpeed: 3.7, aggroRange: 17, attackRange: 2.15, attackCooldown: 1, respawnMs: 16_000 },
  'sand-golem': { id: 'sand-golem', kind: 'grunt', level: 41, maxHp: 880, damage: 38, moveSpeed: 2.5, aggroRange: 18, attackRange: 2.65, attackCooldown: 1.3, respawnMs: 18_000 },
  'sun-guardian-boss': { id: 'sun-guardian-boss', kind: 'boss', level: 48, maxHp: 3200, damage: 50, moveSpeed: 3.1, aggroRange: 26, attackRange: 3.3, attackCooldown: 1.3, respawnMs: 45_000 },
  // เกาะ 4 — เหมันต์คราม
  'frost-crawler': { id: 'frost-crawler', kind: 'crab', level: 51, maxHp: 1050, damage: 43, moveSpeed: 3.65, aggroRange: 16, attackRange: 2.45, attackCooldown: 0.98, respawnMs: 15_000 },
  'frost-raider': { id: 'frost-raider', kind: 'grunt', level: 55, maxHp: 1260, damage: 48, moveSpeed: 3.75, aggroRange: 18, attackRange: 2.2, attackCooldown: 0.98, respawnMs: 16_000 },
  'crystal-golem': { id: 'crystal-golem', kind: 'grunt', level: 62, maxHp: 1680, damage: 58, moveSpeed: 2.55, aggroRange: 19, attackRange: 2.85, attackCooldown: 1.28, respawnMs: 18_000 },
  'frost-king-boss': { id: 'frost-king-boss', kind: 'boss', level: 68, maxHp: 5200, damage: 68, moveSpeed: 3.15, aggroRange: 27, attackRange: 3.5, attackCooldown: 1.25, respawnMs: 50_000 },
  // เกาะ 5 — นภาวายุ
  'cloud-crab': { id: 'cloud-crab', kind: 'crab', level: 71, maxHp: 2050, damage: 63, moveSpeed: 3.8, aggroRange: 17, attackRange: 2.5, attackCooldown: 0.94, respawnMs: 15_000 },
  'sky-raider': { id: 'sky-raider', kind: 'grunt', level: 75, maxHp: 2380, damage: 69, moveSpeed: 3.95, aggroRange: 19, attackRange: 2.25, attackCooldown: 0.93, respawnMs: 16_000 },
  'storm-golem': { id: 'storm-golem', kind: 'grunt', level: 82, maxHp: 3100, damage: 80, moveSpeed: 2.7, aggroRange: 20, attackRange: 3, attackCooldown: 1.2, respawnMs: 18_000 },
  'tempest-lord-boss': { id: 'tempest-lord-boss', kind: 'boss', level: 88, maxHp: 8200, damage: 92, moveSpeed: 3.35, aggroRange: 29, attackRange: 3.7, attackCooldown: 1.18, respawnMs: 50_000 },
  // เกาะ 6 — ภูผาอัคคี
  'lava-crawler': { id: 'lava-crawler', kind: 'crab', level: 91, maxHp: 3900, damage: 88, moveSpeed: 3.9, aggroRange: 18, attackRange: 2.55, attackCooldown: 0.92, respawnMs: 15_000 },
  'ash-cultist': { id: 'ash-cultist', kind: 'grunt', level: 95, maxHp: 4550, damage: 96, moveSpeed: 4.05, aggroRange: 20, attackRange: 2.3, attackCooldown: 0.9, respawnMs: 16_000 },
  'obsidian-golem': { id: 'obsidian-golem', kind: 'grunt', level: 102, maxHp: 5900, damage: 110, moveSpeed: 2.8, aggroRange: 21, attackRange: 3.1, attackCooldown: 1.16, respawnMs: 18_000 },
  'magma-titan-boss': { id: 'magma-titan-boss', kind: 'boss', level: 108, maxHp: 13500, damage: 128, moveSpeed: 3.45, aggroRange: 30, attackRange: 3.9, attackCooldown: 1.12, respawnMs: 60_000 },
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
 * offset ของแต่ละเกาะ (local scene coords → world coords) — ต้องตรงกับ
 * ISLAND_LAYOUT_OFFSETS ฝั่ง client (IslandRegistry) เพื่อให้มอนสเตอร์ที่ Server
 * จำลองอยู่ตรงกับภูมิประเทศเกาะที่ Client เรนเดอร์
 */
export const ISLAND_LAYOUT_OFFSETS: Record<string, { x: number; z: number }> = {
  'starter-island': { x: 0, z: 0 },
  'mist-jungle': { x: 0, z: -80 },
  'sunscar-desert': { x: 190, z: -165 },
  'azure-frost': { x: 465, z: -100 },
  'tempest-sky': { x: 555, z: 120 },
  'ember-volcano': { x: 455, z: 400 },
};

interface WorldCamp {
  id: string;
  islandId: string;
  monsterId: string;
  /** local scene coords (ก่อนบวก offset) */
  x: number;
  z: number;
  radius: number;
  count: number;
}

/** ค่ายมอนสเตอร์เกาะ 2–6 (local coords) — starter ใช้ spawn ที่ authored ไว้ด้านล่าง */
const OUTER_ISLAND_CAMPS: readonly WorldCamp[] = [
  { id: 'jungle-south', islandId: 'mist-jungle', monsterId: 'jungle-bandit', x: 170, z: -58, radius: 6, count: 4 },
  { id: 'jungle-west', islandId: 'mist-jungle', monsterId: 'jungle-bandit', x: 161, z: -55, radius: 4.5, count: 3 },
  { id: 'ruin-sentinels', islandId: 'mist-jungle', monsterId: 'ruin-guardian', x: 183, z: -34, radius: 5.5, count: 3 },
  { id: 'guardian-terrace', islandId: 'mist-jungle', monsterId: 'ruin-guardian', x: 192, z: -45, radius: 5, count: 3 },
  { id: 'oasis-scorpions', islandId: 'sunscar-desert', monsterId: 'dune-scorpion', x: 151, z: 130, radius: 5.5, count: 4 },
  { id: 'east-dune', islandId: 'sunscar-desert', monsterId: 'dune-scorpion', x: 184, z: 125, radius: 5, count: 3 },
  { id: 'sunscar-raiders', islandId: 'sunscar-desert', monsterId: 'desert-raider', x: 148, z: 142, radius: 6, count: 4 },
  { id: 'sandstone-quarry', islandId: 'sunscar-desert', monsterId: 'sand-golem', x: 191, z: 141, radius: 5.5, count: 4 },
  { id: 'frozen-lake', islandId: 'azure-frost', monsterId: 'frost-crawler', x: 28, z: 195, radius: 5.5, count: 4 },
  { id: 'south-snow', islandId: 'azure-frost', monsterId: 'frost-crawler', x: 45, z: 184, radius: 5, count: 3 },
  { id: 'azure-raiders', islandId: 'azure-frost', monsterId: 'frost-raider', x: 11, z: 218, radius: 6, count: 4 },
  { id: 'azure-crystal-mine', islandId: 'azure-frost', monsterId: 'crystal-golem', x: 47, z: 236, radius: 5.5, count: 4 },
  { id: 'cloud-garden', islandId: 'tempest-sky', monsterId: 'cloud-crab', x: -124, z: 190, radius: 5.5, count: 4 },
  { id: 'east-cloud', islandId: 'tempest-sky', monsterId: 'cloud-crab', x: -111, z: 226, radius: 5, count: 3 },
  { id: 'tempest-raiders', islandId: 'tempest-sky', monsterId: 'sky-raider', x: -145, z: 207, radius: 6, count: 4 },
  { id: 'tempest-storm-forge', islandId: 'tempest-sky', monsterId: 'storm-golem', x: -124, z: 232, radius: 5.5, count: 4 },
  { id: 'ember-lava', islandId: 'ember-volcano', monsterId: 'lava-crawler', x: -255, z: 98, radius: 5.5, count: 4 },
  { id: 'ember-east', islandId: 'ember-volcano', monsterId: 'lava-crawler', x: -204, z: 78, radius: 5, count: 3 },
  { id: 'ember-cultists', islandId: 'ember-volcano', monsterId: 'ash-cultist', x: -270, z: 72, radius: 6, count: 4 },
  { id: 'ember-obsidian-mine', islandId: 'ember-volcano', monsterId: 'obsidian-golem', x: -214, z: 56, radius: 5.5, count: 4 },
];

/** บอสประจำเกาะ 2–6 (local coords) */
const OUTER_ISLAND_BOSSES: readonly { islandId: string; monsterId: string; x: number; z: number }[] = [
  { islandId: 'mist-jungle', monsterId: 'venom-ape-boss', x: 190, z: -18 },
  { islandId: 'sunscar-desert', monsterId: 'sun-guardian-boss', x: 170, z: 152 },
  { islandId: 'azure-frost', monsterId: 'frost-king-boss', x: 20, z: 244 },
  { islandId: 'tempest-sky', monsterId: 'tempest-lord-boss', x: -151, z: 236 },
  { islandId: 'ember-volcano', monsterId: 'magma-titan-boss', x: -235, z: 70 },
];

function toWorld(islandId: string, x: number, z: number): { x: number; z: number } {
  const off = ISLAND_LAYOUT_OFFSETS[islandId] ?? { x: 0, z: 0 };
  return { x: x + off.x, z: z + off.z };
}

/** ขยายค่าย/บอส เกาะ 2–6 เป็น spawn รายตัว (world coords) กระจายรอบจุดศูนย์กลาง */
function expandOuterIslandSpawns(): SharedSpawnPoint[] {
  const out: SharedSpawnPoint[] = [];
  for (const camp of OUTER_ISLAND_CAMPS) {
    const spread = Math.min(2.6, camp.radius * 0.5);
    for (let i = 0; i < camp.count; i++) {
      const angle = (i / camp.count) * Math.PI * 2;
      const world = toWorld(camp.islandId, camp.x + Math.cos(angle) * spread, camp.z + Math.sin(angle) * spread);
      out.push({
        spawnId: `${camp.id}-${i + 1}`,
        islandId: camp.islandId,
        monsterId: camp.monsterId,
        homeX: Math.round(world.x * 100) / 100,
        homeZ: Math.round(world.z * 100) / 100,
        patrolRadius: camp.radius,
      });
    }
  }
  for (const boss of OUTER_ISLAND_BOSSES) {
    const world = toWorld(boss.islandId, boss.x, boss.z);
    out.push({
      spawnId: `${boss.islandId}-boss`,
      islandId: boss.islandId,
      monsterId: boss.monsterId,
      homeX: world.x,
      homeZ: world.z,
      patrolRadius: 3,
    });
  }
  return out;
}

/**
 * spawn ประจำโลกทุกเกาะ — starter authored มือ (คงเดิม), เกาะ 2–6 ขยายจากค่าย/บอส
 * ตัวเลขเป็น world coords ที่ Server ยึดเป็นความจริง (Client เรนเดอร์ตามที่ Server ส่ง)
 */
export const SHARED_WORLD_SPAWNS: readonly SharedSpawnPoint[] = [
  { spawnId: 'starter-crab-1', islandId: 'starter-island', monsterId: 'crab', homeX: 22, homeZ: -4, patrolRadius: 5 },
  { spawnId: 'starter-crab-2', islandId: 'starter-island', monsterId: 'crab', homeX: 24, homeZ: -6, patrolRadius: 5 },
  { spawnId: 'starter-crab-3', islandId: 'starter-island', monsterId: 'crab', homeX: 20, homeZ: -2, patrolRadius: 5 },
  { spawnId: 'starter-grunt-1', islandId: 'starter-island', monsterId: 'grunt', homeX: 24, homeZ: 8, patrolRadius: 5 },
  { spawnId: 'starter-grunt-2', islandId: 'starter-island', monsterId: 'grunt', homeX: 26, homeZ: 10, patrolRadius: 5 },
  { spawnId: 'starter-grunt-3', islandId: 'starter-island', monsterId: 'grunt', homeX: 22, homeZ: 12, patrolRadius: 5 },
  // ย้ายบอสไปฝั่งเหนือของเกาะ (ห่างหมู่บ้านค้าขาย + คนละฝั่งกับกองปู/grunt ทางตะวันออก)
  // เปลี่ยน spawnId เพื่อ seed ใหม่ที่จุดนี้ (ไม่ให้ restore ดึงตำแหน่งเดิม 24,4 กลับ)
  { spawnId: 'starter-boss-north', islandId: 'starter-island', monsterId: 'boss', homeX: -14, homeZ: 30, patrolRadius: 3 },
  ...expandOuterIslandSpawns(),
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
  /** Presentation-only hit impulse emitted with the authoritative HP delta. */
  hitReaction?: WorldMonsterHitReaction;
  /** Exact queued attack action invalidated by this authoritative state change. */
  cancelAttackId?: string;
}

export interface WorldMonsterHitReaction {
  directionX: number;
  directionZ: number;
  strength: number;
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
