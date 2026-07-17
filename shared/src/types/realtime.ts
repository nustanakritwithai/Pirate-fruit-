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

export type RealtimeServerMessage =
  | RealtimeWelcome
  | RealtimeEconomyUpdate
  | RealtimeAnnouncement
  | RealtimePong;

export interface RealtimePing {
  type: 'ping';
  sentAt: number;
}

export type RealtimeClientMessage = RealtimePing;

/** ข้อความ client ใหญ่เกินนี้ = protocol violation → ปิด connection */
export const REALTIME_MAX_CLIENT_MESSAGE_BYTES = 1_024;
