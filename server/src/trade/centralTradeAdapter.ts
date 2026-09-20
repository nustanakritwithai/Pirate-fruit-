import { TRADE_PROTOCOL_SCHEMA_VERSION, type TradeExecuteResponse, type TradeCargoSlotSnapshot } from '@pirate-fruit/shared';
import type { CanonicalPlayerState } from '../player/playerState.js';
import { serializePlayerState } from '../player/playerState.js';
import type { EconomyBuyQuote, EconomySellQuote } from '../economy/economyEngine.js';
import type { TradeService } from './tradeService.js';
import { assertTradePrice, parseTradeRequest, tradeRequestHash } from './tradeRules.js';

export type TrustedTradeQuote = (EconomyBuyQuote | EconomySellQuote) & { islandId: string; commodityId: string };
export type CanonicalTradeState = CanonicalPlayerState & { tradeReceipts?: Array<{ key: string; hash: string; outcome: TradeExecuteResponse }> };

/**
 * จุดเข้า typed operation ของ central state ใช้อำนาจ TradeService เดิมโดยตรง
 * เพื่อให้ quote, stock, cargo, coins, SQL transaction และ idempotency อยู่ใน
 * EconomyRuntime.executeAtomic ชุดเดียวกัน ไม่สร้างตลาดหรือ receipt ชุดที่สอง
 * สำหรับ worker/bridge ที่ต้องส่ง operation ต่อให้ backend เดิม
 */
export async function executeCanonicalTrade(
  trade: Pick<TradeService, 'execute'>,
  characterId: string,
  input: unknown,
): Promise<TradeExecuteResponse> {
  // ตรวจ schema ที่นี่ก่อน delegate เพื่อให้ bridge ไม่ส่ง payload รูปแบบอื่น
  // เข้า authority และยังคง error semantics ของ trade route เดิมไว้
  const request = parseTradeRequest(input);
  return trade.execute(characterId, request);
}

export function applyCanonicalTradeOperation(
  current: CanonicalTradeState,
  input: unknown,
  quote: TrustedTradeQuote,
  cargoFits: (boatId: string, slots: readonly TradeCargoSlotSnapshot[], commodityId: string, quantity: number) => boolean,
): { state: CanonicalTradeState; persisted: ReturnType<typeof serializePlayerState>; outcome: TradeExecuteResponse } {
  const request = parseTradeRequest(input);
  if (quote.islandId !== request.islandId || quote.commodityId !== request.commodityId) throw new Error('MARKET_QUOTE_MISMATCH');
  const hash = tradeRequestHash(request);
  const prior = current.tradeReceipts?.find((receipt) => receipt.key === request.idempotencyKey);
  if (prior?.hash === hash) return { state: structuredClone(current), persisted: serializePlayerState(current), outcome: { ...prior.outcome, idempotentReplay: true } };
  if (prior) throw new Error('IDEMPOTENCY_KEY_REUSED');
  const state = structuredClone(current);
  const active = state.boats.find((boat) => boat.active);
  if (!active) throw new Error('INVALID_TRADE_REQUEST');
  const slots = state.cargo.slots.map((slot) => ({ ...slot }));
  const buy = request.action === 'buy';
  const unitPrice = quote.unitPrice;
  assertTradePrice(request.expectedUnitPrice, unitPrice);
  if (buy && 'tradableStock' in quote && quote.tradableStock !== null && quote.tradableStock < request.quantity) throw new Error('INSUFFICIENT_STOCK');
  const gross = unitPrice * request.quantity;
  const fee = buy ? 0 : Math.round(gross * ('feeRate' in quote ? quote.feeRate : 0));
  const total = buy ? gross : gross - fee;
  const held = slots.find((slot) => slot.commodityId === request.commodityId)?.quantity ?? 0;
  if (buy) {
    if (state.progression.coins < total) throw new Error('INSUFFICIENT_COINS');
    if (!cargoFits(active.definitionId, slots, request.commodityId, request.quantity)) throw new Error('CARGO_FULL');
  } else if (held < request.quantity) throw new Error('INSUFFICIENT_CARGO');
  const index = slots.findIndex((slot) => slot.commodityId === request.commodityId);
  if (buy) index >= 0 ? slots[index]!.quantity += request.quantity : slots.push({ commodityId: request.commodityId, quantity: request.quantity });
  else if (held === request.quantity) slots.splice(index, 1); else slots[index]!.quantity -= request.quantity;
  state.progression.coins += buy ? -total : total;
  state.cargo.slots = slots;
  const outcome: TradeExecuteResponse = { ok: true, schemaVersion: TRADE_PROTOCOL_SCHEMA_VERSION, action: request.action,
    islandId: request.islandId, commodityId: request.commodityId, quantity: request.quantity, unitPrice, total, fee,
    coins: state.progression.coins, cargo: slots, idempotentReplay: false };
  state.tradeReceipts = [...(state.tradeReceipts ?? []).slice(-255), { key: request.idempotencyKey, hash, outcome }];
  return { state, persisted: serializePlayerState(state), outcome };
}
