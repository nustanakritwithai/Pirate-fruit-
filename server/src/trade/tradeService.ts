import {
  TRADE_PROTOCOL_SCHEMA_VERSION,
  type TradeExecuteResponse,
} from '@pirate-fruit/shared';
import type { EconomyRuntime } from '../economy/economyRuntime.js';
import {
  PostgresTradeRepository,
  TradeRejectedError,
  type TradeMutationOutcome,
} from './tradeRepository.js';
import { assertTradePrice, parseTradeRequest, tradeRequestHash } from './tradeRules.js';

/**
 * S8 Trade Authority — ตรวจ+คิดราคา+หักคลังเมืองบน "คิวเดียวกับ economy tick"
 * (single writer) และย้ายเงิน/ของด้วยธุรกรรม PostgreSQL เดียว
 * ลำดับสำคัญ: ตรวจทั้งหมด → DB commit → ค่อยแก้ stock ใน engine
 * (engine mutation เป็น in-memory ล้วน ล้มไม่ได้หลัง validate แล้ว)
 */
export class TradeService {
  constructor(
    private readonly runtime: EconomyRuntime,
    private readonly repository: PostgresTradeRepository,
  ) {}

  async execute(characterId: string, body: unknown): Promise<TradeExecuteResponse> {
    const request = parseTradeRequest(body);
    const hash = tradeRequestHash(request);

    return this.runtime.executeAtomic(async (engine) => {
      let unitPrice: number;
      let total: number;
      let fee = 0;

      if (request.action === 'buy') {
        const quote = engine.quoteBuy(request.islandId, request.commodityId, request.quantity);
        if (!quote) {
          throw new TradeRejectedError('MARKET_UNAVAILABLE', 'This market does not sell that commodity');
        }
        if (quote.tradableStock != null && quote.tradableStock < request.quantity) {
          throw new TradeRejectedError(
            'INSUFFICIENT_STOCK',
            `Only ${Math.floor(quote.tradableStock)} units are tradable right now`,
          );
        }
        assertTradePrice(request.expectedUnitPrice, quote.unitPrice);
        unitPrice = quote.unitPrice;
        total = unitPrice * request.quantity;
      } else {
        const quote = engine.quoteSell(request.islandId, request.commodityId, request.quantity);
        if (!quote) {
          throw new TradeRejectedError('MARKET_UNAVAILABLE', 'This market does not buy that commodity');
        }
        assertTradePrice(request.expectedUnitPrice, quote.unitPrice);
        unitPrice = quote.unitPrice;
        const gross = unitPrice * request.quantity;
        fee = Math.round(gross * quote.feeRate);
        total = gross - fee;
      }

      const prepared = await this.repository.prepare({
        characterId,
        action: request.action,
        islandId: request.islandId,
        commodityId: request.commodityId,
        quantity: request.quantity,
        unitPrice,
        total,
        fee,
        idempotencyKey: request.idempotencyKey,
        requestHash: hash,
        cargoFits: (boatId, slots) =>
          engine.cargoFits(boatId, slots, request.commodityId, request.quantity),
      });
      const outcome: TradeMutationOutcome = prepared.outcome;

      try {
        // DB ยังไม่ commit จน EconomyRuntime persist snapshot นี้สำเร็จ
        if (!outcome.idempotentReplay) {
          if (request.action === 'buy') {
            engine.applyBuy(request.islandId, request.commodityId, request.quantity, unitPrice);
          } else {
            engine.applySell(request.islandId, request.commodityId, request.quantity, unitPrice);
          }
        }

        return {
          result: {
            ok: true,
            schemaVersion: TRADE_PROTOCOL_SCHEMA_VERSION,
            action: request.action,
            islandId: request.islandId,
            commodityId: request.commodityId,
            quantity: request.quantity,
            unitPrice,
            total,
            fee,
            coins: outcome.coins,
            cargo: outcome.cargo,
            idempotentReplay: outcome.idempotentReplay,
          } satisfies TradeExecuteResponse,
          commit: prepared.commit,
          rollback: prepared.rollback,
        };
      } catch (error) {
        await prepared.rollback().catch(() => undefined);
        throw error;
      }
    });
  }
}
