import { createEconomyEngine } from '../../economy-engine/entry.js';
import type { EconomyEngine } from '../economy/economyEngine.js';
import type { CanonicalPlayerState } from '../player/playerState.js';
import { serializePlayerState } from '../player/playerState.js';
import {
  applyCanonicalTradeOperation,
  type CanonicalTradeState,
  type TrustedTradeQuote,
} from './centralTradeAdapter.js';
import { parseTradeRequest, tradeRequestHash } from './tradeRules.js';

export interface CentralMarketSnapshot {
  tick: number;
  documentVersion: number;
  document: Record<string, unknown>;
  revision: number;
}

type StateWithEconomy = CanonicalTradeState;

export interface CentralOriginalTradeResult {
  state: StateWithEconomy;
  persisted: ReturnType<typeof serializePlayerState>;
  outcome: ReturnType<typeof applyCanonicalTradeOperation>['outcome'];
  nextMarket: CentralMarketSnapshot;
}

/**
 * ใช้สูตร EconomyEngine เดิมกับ state-operation ของ original worker
 * รับ market snapshot กลางแยกจาก player state และคืน nextMarket แยกกลับไป
 * เพื่อให้ C# ล็อก/อัปเดตแถวตลาดกลางพร้อม player aggregate ใน transaction เดียว
 */
export async function applyCentralOriginalTradeOperation(
  current: StateWithEconomy,
  input: unknown,
  market: CentralMarketSnapshot | null | undefined,
  commandId?: string,
): Promise<CentralOriginalTradeResult> {
  if (!market || !Number.isSafeInteger(market.revision) || market.revision < 0
    || !market.document || typeof market.document !== 'object') throw new Error('MARKET_STATE_REQUIRED');
  const request = parseTradeRequest(input);
  const hash = tradeRequestHash(request);
  const operationReceipts = (current as StateWithEconomy & {
    operationReceipts?: Array<{ key: string; hash: string; outcome: unknown }>;
  }).operationReceipts;
  const operationReceipt = commandId
    ? operationReceipts?.find((receipt) => receipt.key === commandId)
    : undefined;
  if (operationReceipt) {
    const state = structuredClone(current) as StateWithEconomy;
    return {
      state,
      persisted: serializePlayerState(state),
      outcome: { ...(operationReceipt.outcome as ReturnType<typeof applyCanonicalTradeOperation>['outcome']), idempotentReplay: true },
      nextMarket: structuredClone(market),
    };
  }
  const prior = current.tradeReceipts?.find((receipt) => receipt.key === request.idempotencyKey);
  if (prior?.hash === hash) {
    const state = structuredClone(current) as StateWithEconomy;
    return { state, persisted: serializePlayerState(state), outcome: { ...prior.outcome, idempotentReplay: true } };
  }
  if (prior) throw new Error('IDEMPOTENCY_KEY_REUSED');

  const engine = await createEconomyEngine(market.document);
  const quote = trustedQuote(engine, request.action, request.islandId, request.commodityId, request.quantity);
  const projected = applyCanonicalTradeOperation(current, request, quote,
    (boatId, slots, commodityId, quantity) => engine.cargoFits(boatId, slots, commodityId, quantity));

  if (request.action === 'buy') {
    engine.applyBuy(request.islandId, request.commodityId, request.quantity, quote.unitPrice);
  } else {
    engine.applySell(request.islandId, request.commodityId, request.quantity, quote.unitPrice);
  }
  const state = projected.state as StateWithEconomy;
  if (commandId) {
    const operationState = state as StateWithEconomy & {
      operationReceipts?: Array<{ key: string; hash: string; outcome: unknown }>;
    };
    operationState.operationReceipts = [
      ...(operationState.operationReceipts ?? []).filter((receipt) => receipt.key !== commandId),
      { key: commandId, hash: JSON.stringify(request), outcome: projected.outcome },
    ].slice(-256);
  }
  const snapshot = engine.snapshot();
  return {
    state,
    persisted: serializePlayerState(state),
    outcome: projected.outcome,
    nextMarket: { ...snapshot, revision: market.revision + 1 },
  };
}

function trustedQuote(
  engine: EconomyEngine,
  action: 'buy' | 'sell',
  islandId: string,
  commodityId: string,
  quantity: number,
): TrustedTradeQuote {
  const quote = action === 'buy'
    ? engine.quoteBuy(islandId, commodityId, quantity)
    : engine.quoteSell(islandId, commodityId, quantity);
  if (!quote) throw new Error('MARKET_UNAVAILABLE');
  return { ...quote, islandId, commodityId };
}
