import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  TRADE_PRICE_TOLERANCE,
  TRADE_PROTOCOL_SCHEMA_VERSION,
  type TradeExecuteResponse,
} from '@pirate-fruit/shared';
import type { EconomyRuntime } from '../economy/economyRuntime.js';
import {
  PostgresTradeRepository,
  TradeRejectedError,
  type TradeMutationOutcome,
} from './tradeRepository.js';

const tradeRequestSchema = z.object({
  schemaVersion: z.literal(TRADE_PROTOCOL_SCHEMA_VERSION),
  idempotencyKey: z.string().min(8).max(128),
  action: z.enum(['buy', 'sell']),
  islandId: z.string().min(1).max(96),
  commodityId: z.string().min(1).max(128),
  quantity: z.number().int().min(1).max(999),
  expectedUnitPrice: z.number().int().positive().max(1_000_000_000).optional(),
});

export type TradeRequest = z.infer<typeof tradeRequestSchema>;

function requestHash(request: TradeRequest): string {
  return createHash('sha256')
    .update(
      [request.action, request.islandId, request.commodityId, request.quantity].join('|'),
      'utf8',
    )
    .digest('hex');
}

/** ราคาวิ่งเกิน tolerance ระหว่างผู้เล่นเห็นกับกดยืนยัน → ให้กดใหม่ด้วยราคาปัจจุบัน */
function assertPriceWithinTolerance(expected: number | undefined, actual: number): void {
  if (expected === undefined) return;
  if (Math.abs(actual - expected) > Math.max(1, expected * TRADE_PRICE_TOLERANCE)) {
    throw new TradeRejectedError(
      'PRICE_MOVED',
      `Unit price is now ${actual} (you confirmed ${expected})`,
    );
  }
}

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
    const request = tradeRequestSchema.parse(body);
    const hash = requestHash(request);

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
        assertPriceWithinTolerance(request.expectedUnitPrice, quote.unitPrice);
        unitPrice = quote.unitPrice;
        total = unitPrice * request.quantity;
      } else {
        const quote = engine.quoteSell(request.islandId, request.commodityId, request.quantity);
        if (!quote) {
          throw new TradeRejectedError('MARKET_UNAVAILABLE', 'This market does not buy that commodity');
        }
        assertPriceWithinTolerance(request.expectedUnitPrice, quote.unitPrice);
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
