/**
 * S12 — สัญญา protocol ของ Progression Authority (EXP/Level เป็นของ Server)
 */

export const PROGRESSION_PROTOCOL_SCHEMA_VERSION = 1 as const;

/** เพดานจำนวนการฆ่ารวมต่อหน้าต่าง 60 วินาที (plausibility — เร็วกว่านี้ = เกินมนุษย์เล่นจริง) */
export const KILL_RATE_WINDOW_MS = 60_000 as const;
export const KILL_RATE_MAX_PER_WINDOW = 40 as const;

export interface ProgressionStateResponse {
  ok: true;
  schemaVersion: typeof PROGRESSION_PROTOCOL_SCHEMA_VERSION;
  /** ค่าทางการจากบันทึกของ Server (level เดินจาก EXP ที่ Server แจกเอง) */
  level: number;
  exp: number;
  coins: number;
}
