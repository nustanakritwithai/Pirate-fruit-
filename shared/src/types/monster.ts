/**
 * S11 — สัญญา protocol ของ Monster Reward Authority
 * Client รายงาน "การฆ่า" (intent) — เลขรางวัลทุกตัวคิดจาก databook + ตัวคูณ
 * เลเวลฝั่ง Server เท่านั้น; คำขอไม่มี field เลขรางวัลให้ส่ง
 */

export const MONSTER_PROTOCOL_SCHEMA_VERSION = 1 as const;

/** เพดานต่อหนึ่งรายงาน (กันรายงานเวอร์เกินจริง — transitional จนกว่า combat จะเป็นของ Server ใน S12) */
export const MONSTER_KILLS_MAX_ENTRIES = 20 as const;
export const MONSTER_KILLS_MAX_COUNT = 10 as const;

export type MonsterRejectCode =
  | 'UNKNOWN_MONSTER'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'INVALID_MONSTER_REQUEST'
  | 'SESSION_REQUIRED';

export interface MonsterKillEntry {
  monsterId: string;
  count: number;
}

export interface MonsterKillsRequest {
  schemaVersion: typeof MONSTER_PROTOCOL_SCHEMA_VERSION;
  idempotencyKey: string;
  kills: MonsterKillEntry[];
}

export interface MonsterKillRewardEntry {
  monsterId: string;
  count: number;
  playerExp: number;
  coins: number;
  masteryExp: number;
}

export interface MonsterKillsResponse {
  ok: true;
  schemaVersion: typeof MONSTER_PROTOCOL_SCHEMA_VERSION;
  /** รางวัลรายรายการ (ลำดับเดียวกับ kills ที่ส่งมา) — client ใช้แตก mastery ต่อการฆ่า */
  rewards: MonsterKillRewardEntry[];
  totals: { playerExp: number; coins: number; masteryExp: number };
  /** ยอดเหรียญ canonical (characters.coins) หลังบวกรางวัลแล้ว */
  coinsTotal: number;
  idempotentReplay: boolean;
}
