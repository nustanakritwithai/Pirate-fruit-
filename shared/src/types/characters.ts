/**
 * S18 — Character Select: กติกากลางของช่องตัวละคร (Client validate เพื่อ UX,
 * Server validate ซ้ำเป็นคนตัดสิน — ห้ามเชื่อ input จาก Client)
 */

/** จำนวนช่องตัวละครสูงสุดต่อบัญชี */
export const MAX_CHARACTER_SLOTS = 3;

export const CHARACTER_NAME_MIN = 2;
export const CHARACTER_NAME_MAX = 20;

/** ไทย/ละติน/ตัวเลข/ช่องว่าง/ขีด — กันชื่อว่างและอักขระควบคุม */
const CHARACTER_NAME_PATTERN = /^[฀-๿a-zA-Z0-9 _-]+$/;

/**
 * ทำความสะอาดชื่อตัวละคร: trim + ยุบช่องว่างซ้ำ แล้วตรวจความยาว/ชุดอักขระ
 * คืน null เมื่อไม่ผ่านกติกา
 */
export function sanitizeCharacterName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const collapsed = raw.trim().replace(/\s+/g, ' ');
  if (collapsed.length < CHARACTER_NAME_MIN || collapsed.length > CHARACTER_NAME_MAX) return null;
  if (!CHARACTER_NAME_PATTERN.test(collapsed)) return null;
  return collapsed;
}

/** ข้อมูลตัวละครหนึ่งช่องในหน้าเลือกตัวละคร */
export interface CharacterSummary {
  id: string;
  name: string;
  level: number;
  coins: number;
  currentIslandId: string;
  createdAt: string;
  /** ตัวที่ session นี้เลือกอยู่ */
  active: boolean;
}

export interface CharacterListResponse {
  ok: true;
  characters: CharacterSummary[];
  maxSlots: number;
}

export interface CharacterMutationResponse {
  ok: true;
  character: CharacterSummary;
}

export interface CharacterDeleteResponse {
  ok: true;
  deletedId: string;
  remaining: number;
  /** true = ลบตัวสุดท้าย → Server เพิกถอน session (Client กลับสู่หน้าสร้างตัวละคร) */
  sessionRevoked: boolean;
}
