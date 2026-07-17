/**
 * S8 — Server-authoritative Trade contract
 * Client ส่งเฉพาะ "intent" (อยากซื้อ/ขายอะไร เท่าไร) — Server เป็นผู้ตัดสิน
 * ราคา สต็อก เหรียญ และ cargo ทั้งหมด แล้วตอบค่าที่เป็นจริงกลับมา
 */

export const TRADE_PROTOCOL_SCHEMA_VERSION = 1;

/** กันราคาวิ่งระหว่างผู้เล่นเห็นราคากับกดยืนยัน — ต่างเกินสัดส่วนนี้ให้ปฏิเสธ */
export const TRADE_PRICE_TOLERANCE = 0.1;

export type TradeAction = 'buy' | 'sell';

export interface TradeExecuteRequest {
  schemaVersion: typeof TRADE_PROTOCOL_SCHEMA_VERSION;
  idempotencyKey: string;
  action: TradeAction;
  islandId: string;
  commodityId: string;
  quantity: number;
  /** ราคาต่อหน่วยที่ผู้เล่นเห็นตอนกด — Server ใช้เทียบ tolerance เท่านั้น ไม่ใช้คิดเงิน */
  expectedUnitPrice?: number;
}

export interface TradeCargoSlotSnapshot {
  commodityId: string;
  quantity: number;
}

export interface TradeExecuteResponse {
  ok: true;
  schemaVersion: typeof TRADE_PROTOCOL_SCHEMA_VERSION;
  action: TradeAction;
  islandId: string;
  commodityId: string;
  quantity: number;
  /** ราคาต่อหน่วยที่ Server คิดจริง */
  unitPrice: number;
  /** buy = ราคารวมที่หัก, sell = ยอดสุทธิหลังหักค่าธรรมเนียม */
  total: number;
  fee: number;
  /** เหรียญคงเหลือจริงจาก characters.coins (canonical) */
  coins: number;
  /** cargo ทั้งลำหลังธุรกรรม (canonical จาก player_cargo) */
  cargo: TradeCargoSlotSnapshot[];
  idempotentReplay: boolean;
}

/** โค้ดปฏิเสธที่ Client ต้องรู้จักเพื่อแสดงข้อความ/ตัดสินใจ retry */
export type TradeRejectCode =
  | 'FEATURE_DISABLED'
  | 'SESSION_REQUIRED'
  | 'MARKET_UNAVAILABLE'
  | 'INSUFFICIENT_STOCK'
  | 'INSUFFICIENT_COINS'
  | 'INSUFFICIENT_CARGO'
  | 'CARGO_FULL'
  | 'PRICE_MOVED'
  | 'ECONOMY_NOT_READY'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'INVALID_TRADE_REQUEST';
