/**
 * S10 — สัญญา protocol ของ Quest/Reward Authority
 * Client ส่งได้แค่ "intent" (รับเควสต์ / รายงานเหตุการณ์ / ขอเคลมรางวัล)
 * เลขรางวัลทุกตัวมาจากนิยามฝั่ง Server เท่านั้น — ห้ามเชื่อรางวัลจาก Client
 */

export const QUEST_PROTOCOL_SCHEMA_VERSION = 1 as const;

/** เพดานเหตุการณ์ต่อหนึ่งรายงาน + เพดานจำนวนต่อเหตุการณ์ (กันรายงานเวอร์เกินจริง) */
export const QUEST_PROGRESS_MAX_EVENTS = 10 as const;
export const QUEST_PROGRESS_MAX_AMOUNT = 99 as const;

export type QuestRejectCode =
  | 'QUEST_NOT_FOUND'
  | 'LEVEL_TOO_LOW'
  | 'QUEST_ALREADY_ACTIVE'
  | 'ACTIVE_QUEST_CONFLICT'
  | 'QUEST_NOT_REPEATABLE'
  | 'NO_ACTIVE_QUEST'
  | 'QUEST_NOT_COMPLETE'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'INVALID_QUEST_REQUEST'
  | 'SESSION_REQUIRED';

export type QuestProgressEventKind = 'kill' | 'deliver';

export interface QuestProgressEventPayload {
  kind: QuestProgressEventKind;
  targetId: string;
  amount: number;
  /** kill: ตัวที่ตายเป็นบอสไหม (ใช้จับ objective ชนิด boss) */
  isBoss?: boolean;
  /** deliver: เกาะที่ขายเกิดขึ้น */
  islandId?: string;
}

export interface QuestActiveSnapshot {
  questId: string;
  progress: number[];
  status: 'active' | 'completed';
}

export interface QuestStateResponse {
  ok: true;
  schemaVersion: typeof QUEST_PROTOCOL_SCHEMA_VERSION;
  active: QuestActiveSnapshot | null;
  completedQuestIds: string[];
}

export interface QuestAcceptRequest {
  schemaVersion: typeof QUEST_PROTOCOL_SCHEMA_VERSION;
  questId: string;
  replaceActive?: boolean;
}

export interface QuestAcceptResponse {
  ok: true;
  schemaVersion: typeof QUEST_PROTOCOL_SCHEMA_VERSION;
  questId: string;
  progress: number[];
}

export interface QuestProgressRequest {
  schemaVersion: typeof QUEST_PROTOCOL_SCHEMA_VERSION;
  events: QuestProgressEventPayload[];
}

export interface QuestProgressResponse {
  ok: true;
  schemaVersion: typeof QUEST_PROTOCOL_SCHEMA_VERSION;
  /** null = ไม่มีเควสต์ active ฝั่ง Server (เหตุการณ์ถูกทิ้งเฉย ๆ ไม่ใช่ error) */
  questId: string | null;
  progress: number[];
  completed: boolean;
}

export interface QuestClaimRequest {
  schemaVersion: typeof QUEST_PROTOCOL_SCHEMA_VERSION;
  questId: string;
  idempotencyKey: string;
}

export interface QuestClaimResponse {
  ok: true;
  schemaVersion: typeof QUEST_PROTOCOL_SCHEMA_VERSION;
  questId: string;
  /** เลขรางวัลที่ Server ตัดสิน — Client ใช้ apply ฝั่งตนเท่านั้น */
  playerExp: number;
  coins: number;
  masteryBonus: number;
  /** ยอดเหรียญ canonical (characters.coins) หลังบวกรางวัลแล้ว */
  coinsTotal: number;
  idempotentReplay: boolean;
}
