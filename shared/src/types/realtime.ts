/**
 * S9 — WebSocket Foundation contract
 * Server push: economy updates / announcements / สถานะ session — Client ห้ามส่งคำสั่งเกม
 * ผ่านช่องนี้ (คำสั่งยังเป็น HTTP ที่มี CSRF จนกว่า S10+ จะย้ายเป็นราย feature)
 *
 * การกัน out-of-order: ทุกข้อความจาก Server มี `seq` เพิ่มทีละ 1 ต่อ connection —
 * Client ที่เห็น seq กระโดดต้อง resync (ดึง snapshot ทาง REST) แล้วนับต่อจาก seq ใหม่
 */

import type { WorldMonsterDelta, WorldMonsterSnapshot } from '../world/monsters.js';

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

export interface RealtimeWorldMonsterDead {
  type: 'world-monster-dead';
  seq: number;
  spawnId: string;
  /** ผู้เล่นที่ฟันหมัดสุดท้าย (ให้เครดิต/แสดงผล) */
  byId?: string;
}

export interface RealtimeWorldMonsterRespawn {
  type: 'world-monster-respawn';
  seq: number;
  monster: WorldMonsterSnapshot;
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
  | RealtimeWorldMonsterSnapshot
  | RealtimeWorldMonsterDelta
  | RealtimeWorldMonsterDead
  | RealtimeWorldMonsterRespawn;

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
}

/** S15 — Client รายงาน "เจตนาโจมตี" ผู้เล่นอีกคน (PvP) — Server ตัดสินผลเอง */
export interface RealtimeAttack {
  type: 'attack';
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
  | RealtimeWorldMonsterHit;

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
/** แพ้แล้วเกิดใหม่ (HP เต็ม) หลังผ่านไปกี่มิลลิวินาที */
export const PVP_RESPAWN_MS = 5_000;
