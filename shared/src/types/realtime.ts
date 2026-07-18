/**
 * S9 — WebSocket Foundation contract
 * Server push: economy updates / announcements / สถานะ session — Client ห้ามส่งคำสั่งเกม
 * ผ่านช่องนี้ (คำสั่งยังเป็น HTTP ที่มี CSRF จนกว่า S10+ จะย้ายเป็นราย feature)
 *
 * การกัน out-of-order: ทุกข้อความจาก Server มี `seq` เพิ่มทีละ 1 ต่อ connection —
 * Client ที่เห็น seq กระโดดต้อง resync (ดึง snapshot ทาง REST) แล้วนับต่อจาก seq ใหม่
 */

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

export type RealtimeServerMessage =
  | RealtimeWelcome
  | RealtimeEconomyUpdate
  | RealtimeAnnouncement
  | RealtimePong
  | RealtimePresence
  | RealtimePresenceLeave;

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

export type RealtimeClientMessage = RealtimePing | RealtimeMove;

/** ข้อความ client ใหญ่เกินนี้ = protocol violation → ปิด connection */
export const REALTIME_MAX_CLIENT_MESSAGE_BYTES = 1_024;

/** S13 — ผู้เล่นส่ง move ถี่กว่านี้ Server จะทิ้ง (throttle presence relay ~12.5/วิ) */
export const REALTIME_MOVE_MIN_INTERVAL_MS = 80;
