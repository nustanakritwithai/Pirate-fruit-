/**
 * S9 — WebSocket Foundation contract
 * Server push: economy updates / announcements / สถานะ session — Client ห้ามส่งคำสั่งเกม
 * ผ่านช่องนี้ (คำสั่งยังเป็น HTTP ที่มี CSRF จนกว่า S10+ จะย้ายเป็นราย feature)
 *
 * การกัน out-of-order: ทุกข้อความจาก Server มี `seq` เพิ่มทีละ 1 ต่อ connection —
 * Client ที่เห็น seq กระโดดต้อง resync (ดึง snapshot ทาง REST) แล้วนับต่อจาก seq ใหม่
 */

import type { WorldMonsterDelta, WorldMonsterSnapshot } from '../world/monsters.js';
import type { BoatWorldSnapshot, RealtimeBoatIntent } from '../world/boats.js';

export const REALTIME_PROTOCOL_VERSION = 1;

/** Server ส่ง heartbeat interval ให้ตอน welcome — Client ping ตามรอบนี้ */
export const REALTIME_HEARTBEAT_INTERVAL_MS = 15_000;
/** ไม่เห็น pong/ข้อความใดเกินนี้ = ตายแล้ว ตัดทิ้ง/ต่อใหม่ */
export const REALTIME_IDLE_TIMEOUT_MS = 45_000;

export interface RealtimeWelcome {
  type: 'welcome';
  seq: number;
  protocolVersion: typeof REALTIME_PROTOCOL_VERSION;
  serverTime: string;
  heartbeatIntervalMs: number;
}

export interface RealtimeEconomyUpdate {
  type: 'economy';
  seq: number;
  tick: number;
  /** เอกสารโลกแบบเดียวกับ GET /api/economy/world (state.world = serialized JSON) */
  state: { schemaVersion: number; world: string };
}

export interface RealtimeAnnouncement {
  type: 'announcement';
  seq: number;
  level: 'info' | 'warning';
  message: string;
}

export interface RealtimePong {
  type: 'pong';
  seq: number;
  echo: number;
}

/**
 * S13 — presence ของผู้เล่นคนอื่นบนเกาะเดียวกัน (ตำแหน่ง/ทิศ ล่าสุด)
 * เป็นข้อมูล ephemeral: เฟรมที่มาช้าหรือหลุดช่วงไม่ต้อง resync — เฟรมถัดไปเป็น
 * ตำแหน่งสัมบูรณ์ที่ทับของเก่าได้เลย (ต่างจาก economy ที่ต้องกันช่องว่าง)
 */
export interface RealtimePresence {
  type: 'presence';
  seq: number;
  playerId: string;
  name: string;
  islandId: string;
  x: number;
  y: number;
  z: number;
  heading: number;
  /** true = ผู้เล่นกำลังขับเรือ (client เลือกโมเดล ghost ให้ต่างออกไปได้) */
  onBoat: boolean;
  /** S14: รุ่นเรือที่ขับอยู่ (BOAT_DEFINITIONS id) — client เรนเดอร์เรือให้ตรงรุ่น */
  boatId?: string;
  /** Presentation-only appearance contract. Never participates in gameplay authority. */
  appearance?: RealtimeCharacterAppearance;
  /** Presentation-only locomotion; never used for movement/combat authority. */
  locomotion?: 'idle' | 'walk' | 'run' | 'swim';
  /** Complete visual animation snapshot. It is never trusted for gameplay. */
  animation?: RealtimePlayerAnimation;
}

export interface RealtimePlayerAnimation {
  combatState: 'idle' | 'attack1' | 'attack2' | 'attack3' | 'attack4'
    | 'casting' | 'blocking' | 'stunned' | 'knockback' | 'knockdown' | 'dead';
  category: 'style' | 'sword' | 'gun' | 'fruit' | 'utility';
  onGround: boolean;
  dashing: boolean;
  verticalVelocity: number;
  attackProgress?: number;
  hitReactionId?: number;
  hitReactionAngle?: number;
  skillAnimationProgress?: number;
  skillAnimationReleaseProgress?: number;
  skillAnimationType?: 'projectile' | 'beam' | 'aoe' | 'ground' | 'dash'
    | 'flurry' | 'buff' | 'summon' | 'homing' | 'teleport';
  skillAnimationVariant?: number;
  skillAnimationUltimate?: boolean;
  skillAnimationCategory?: 'style' | 'sword' | 'gun' | 'fruit' | 'utility';
}

/** Versioned so future character models, clothing and equipped-item visuals can evolve safely. */
export interface RealtimeCharacterAppearance {
  schemaVersion: 1;
  avatarId: 'pirate-v1';
  clothingIds: string[];
  equipmentIds: string[];
}

export interface RealtimePresenceLeave {
  type: 'presence-leave';
  seq: number;
  playerId: string;
}

/**
 * S15 — Multiplayer Combat Authority (PvP)
 * Server เป็นเจ้าของ HP การต่อสู้ระหว่างผู้เล่นทั้งหมด: Client ส่งได้แค่ "เจตนาโจมตี"
 * (attack intent) — ดาเมจ/HP/ตาย/เกิดใหม่ Server คิดเองล้วน ไม่เชื่อค่าจาก Client
 * combat-hit/-defeat/-respawn เป็น absolute state เหมือน presence: ทับของเก่าได้เลย
 */
export interface RealtimeCombatHit {
  type: 'combat-hit';
  seq: number;
  attackerId: string;
  targetId: string;
  /** ดาเมจที่ Server คิด (ค่าคงที่ตาม kind — Client ส่งค่ามาไม่ได้) */
  damage: number;
  /** HP ของเป้าหลังโดน (Server authority) + เพดาน เพื่อ map เป็นหลอดเลือดฝั่ง Client */
  hp: number;
  maxHp: number;
  /** Server-computed presentation impulse; never accepted from Client input. */
  knockback?: RealtimeKnockback;
}

export interface RealtimeKnockback {
  directionX: number;
  directionZ: number;
  speed: number;
  duration: number;
}

export interface RealtimeCombatDefeat {
  type: 'combat-defeat';
  seq: number;
  playerId: string;
  /** ผู้เล่นที่ทำให้แพ้ (ให้เครดิต/แสดงผล) */
  byId: string;
}

export interface RealtimeCombatRespawn {
  type: 'combat-respawn';
  seq: number;
  playerId: string;
  hp: number;
  maxHp: number;
}

export type RealtimeCombatRejectReason =
  | 'pvp-disabled'
  | 'self-target'
  | 'presence-required'
  | 'target-unavailable'
  | 'different-island'
  | 'defeated'
  | 'cooldown'
  | 'out-of-range';

/** Acknowledgement for one attack intent; only combat-hit changes authoritative HP. */
export interface RealtimeCombatResult {
  type: 'combat-result';
  seq: number;
  intentId: string;
  targetId: string;
  accepted: boolean;
  reason?: RealtimeCombatRejectReason;
}

/**
 * S16 — Shared Monster World State
 * Server จำลองมอนสเตอร์กลาง แล้ว push snapshot (full) + delta (ต่อ tick) ให้ผู้เล่น
 * ที่อยู่ในระยะสนใจ; death/respawn เป็น event แยกให้ทุกคนบนเกาะเห็นตรงกัน
 */
export interface RealtimeWorldMonsterSnapshot {
  type: 'world-monster-snapshot';
  seq: number;
  islandId: string;
  monsters: WorldMonsterSnapshot[];
}

export interface RealtimeWorldMonsterDelta {
  type: 'world-monster-delta';
  seq: number;
  islandId: string;
  updates: WorldMonsterDelta[];
}

export interface WorldMonsterReward {
  monsterId: string;
  playerExp: number;
  coins: number;
  masteryExp: number;
  /** ยอดเหรียญ authoritative หลังธุรกรรม ใช้แก้ client cache ให้ตรง Server */
  coinsTotal: number;
}

export interface RealtimeWorldMonsterDead {
  type: 'world-monster-dead';
  seq: number;
  spawnId: string;
  /** ผู้เล่นที่ฟันหมัดสุดท้าย (ให้เครดิต/แสดงผล) */
  byId?: string;
  /** มีเฉพาะหลัง Server commit รางวัลสำเร็จ; client อื่นเห็นได้แต่ apply เฉพาะ byId ของตน */
  reward?: WorldMonsterReward;
}

export interface RealtimeWorldMonsterRespawn {
  type: 'world-monster-respawn';
  seq: number;
  monster: WorldMonsterSnapshot;
}

/** S17 — full boat world seed, authoritative absolute deltas, naval events. */
export interface RealtimeBoatSnapshot {
  type: 'boat-snapshot';
  seq: number;
  islandId: string;
  boats: BoatWorldSnapshot[];
}

export interface RealtimeBoatDelta {
  type: 'boat-delta';
  seq: number;
  boat: BoatWorldSnapshot;
}

export interface RealtimeBoatCannon {
  type: 'boat-cannon';
  seq: number;
  attackerId: string;
  targetId?: string;
  side: 'port' | 'starboard';
  damage: number;
  targetHp?: number;
  x: number;
  z: number;
}

export interface RealtimeBoatSunk {
  type: 'boat-sunk';
  seq: number;
  entityId: string;
  byEntityId?: string;
  respawnAt: number;
}

export interface RealtimeBoatRespawn {
  type: 'boat-respawn';
  seq: number;
  boat: BoatWorldSnapshot;
}

export interface RealtimeBoatIntentResult {
  type: 'boat-intent-result';
  seq: number;
  intentId: string;
  accepted: boolean;
  reason?: string;
  entityId?: string;
}

export type RealtimeServerMessage =
  | RealtimeWelcome
  | RealtimeEconomyUpdate
  | RealtimeAnnouncement
  | RealtimePong
  | RealtimePresence
  | RealtimePresenceLeave
  | RealtimeCombatHit
  | RealtimeCombatDefeat
  | RealtimeCombatRespawn
  | RealtimeCombatResult
  | RealtimeWorldMonsterSnapshot
  | RealtimeWorldMonsterDelta
  | RealtimeWorldMonsterDead
  | RealtimeWorldMonsterRespawn
  | RealtimeBoatSnapshot
  | RealtimeBoatDelta
  | RealtimeBoatCannon
  | RealtimeBoatSunk
  | RealtimeBoatRespawn
  | RealtimeBoatIntentResult;

export interface RealtimePing {
  type: 'ping';
  sentAt: number;
}

/** S13 — client รายงานตำแหน่งตัวเอง (presence relay เท่านั้น — ไม่ใช่ authority) */
export interface RealtimeMove {
  type: 'move';
  islandId: string;
  x: number;
  y: number;
  z: number;
  heading: number;
  onBoat: boolean;
  /** S14: รุ่นเรือที่ขับอยู่ (ส่งเมื่อ onBoat) */
  boatId?: string;
  /** Presentation-only animation hint. */
  locomotion?: 'idle' | 'walk' | 'run' | 'swim';
  animation?: RealtimePlayerAnimation;
}

/** S15 — Client รายงาน "เจตนาโจมตี" ผู้เล่นอีกคน (PvP) — Server ตัดสินผลเอง */
export interface RealtimeAttack {
  type: 'attack';
  /** Client correlation only; never affects damage or authority. */
  intentId: string;
  /** characterId ของเป้า (Server ตรวจระยะ/เกาะ/คูลดาวน์เอง) */
  targetId: string;
  /** ชนิดการโจมตี — Server ใช้เลือกดาเมจจากตารางของตัวเอง (ไม่รับดาเมจจาก Client) */
  kind: 'melee' | 'skill';
  /** ข้อมูลประกอบ (log/telemetry) — ไม่มีผลต่อดาเมจ */
  skillId?: string;
}

/** S16 — Client รายงานเจตนาตีมอนสเตอร์กลาง — Server ตัดสินดาเมจ/ตาย/contribution เอง */
export interface RealtimeWorldMonsterHit {
  type: 'world-monster-hit';
  spawnId: string;
  kind: 'melee' | 'skill';
}

export type RealtimeClientMessage =
  | RealtimePing
  | RealtimeMove
  | RealtimeAttack
  | RealtimeWorldMonsterHit
  | RealtimeBoatIntent;

/** ข้อความ client ใหญ่เกินนี้ = protocol violation → ปิด connection */
export const REALTIME_MAX_CLIENT_MESSAGE_BYTES = 1_024;

/** S13 — ผู้เล่นส่ง move ถี่กว่านี้ Server จะทิ้ง (throttle presence relay ~12.5/วิ) */
export const REALTIME_MOVE_MIN_INTERVAL_MS = 80;

/**
 * S15 — ค่าคงที่ PvP (Server เป็นเจ้าของทั้งหมด — Client อ่านเพื่อ predict/แสดงผลได้
 * แต่ไม่มีผลต่อ authority)
 */
export const PVP_MAX_HP = 100;
/** ดาเมจต่อครั้งตามชนิด — คงที่ กัน Client ปั้นดาเมจ (จูนสมดุลภายหลังได้) */
export const PVP_MELEE_DAMAGE = 7;
export const PVP_SKILL_DAMAGE = 16;
/** โจมตีโดนเป้าเดิมถี่กว่านี้ Server ทิ้ง (กันสแปม/ออโต้) */
export const PVP_ATTACK_MIN_INTERVAL_MS = 300;
/** ระยะสูงสุดที่นับว่าโจมตีถึง (world units) — วัดจาก presence ล่าสุดของทั้งคู่ */
export const PVP_MELEE_RANGE = 4.5;
export const PVP_SKILL_RANGE = 22;
/** Presentation-only impulse computed by the Server after a confirmed hit. */
export const PVP_MELEE_KNOCKBACK_SPEED = 6;
export const PVP_SKILL_KNOCKBACK_SPEED = 10;
export const PVP_MELEE_KNOCKBACK_DURATION = 0.16;
export const PVP_SKILL_KNOCKBACK_DURATION = 0.24;
/** แพ้แล้วเกิดใหม่ (HP เต็ม) หลังผ่านไปกี่มิลลิวินาที */
export const PVP_RESPAWN_MS = 5_000;
