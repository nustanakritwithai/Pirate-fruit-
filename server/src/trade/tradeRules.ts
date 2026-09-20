import { createHash } from 'node:crypto';
import { z } from 'zod';
import { TRADE_PRICE_TOLERANCE, TRADE_PROTOCOL_SCHEMA_VERSION, type TradeExecuteRequest } from '@pirate-fruit/shared';
import { TradeRejectedError } from './tradeRepository.js';

export const tradeRequestSchema = z.object({
  schemaVersion: z.literal(TRADE_PROTOCOL_SCHEMA_VERSION),
  idempotencyKey: z.string().min(8).max(128),
  action: z.enum(['buy', 'sell']), islandId: z.string().min(1).max(96),
  commodityId: z.string().min(1).max(128), quantity: z.number().int().min(1).max(999),
  expectedUnitPrice: z.number().int().positive().max(1_000_000_000).optional(),
}).strict();
export type TradeRequest = z.infer<typeof tradeRequestSchema>;
export const parseTradeRequest = (input: unknown): TradeRequest => tradeRequestSchema.parse(input);
export const tradeRequestHash = (request: TradeRequest): string => createHash('sha256')
  .update([request.action, request.islandId, request.commodityId, request.quantity].join('|'), 'utf8').digest('hex');
export function assertTradePrice(expected: number | undefined, actual: number): void {
  if (expected !== undefined && Math.abs(actual - expected) > Math.max(1, expected * TRADE_PRICE_TOLERANCE)) {
    throw new TradeRejectedError('PRICE_MOVED', `Unit price is now ${actual} (you confirmed ${expected})`);
  }
}
