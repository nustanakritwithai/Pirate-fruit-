/**
 * S8 — ส่ง trade intent ไปให้ Server ตัดสิน (ราคา/สต็อก/เงิน/cargo เป็นของ Server)
 * เปิดใช้ด้วย VITE_ENABLE_TRADE_SERVER + ต้องมี Remote Session ที่ online เท่านั้น
 */

import {
  TRADE_PROTOCOL_SCHEMA_VERSION,
  type TradeAction,
  type TradeExecuteRequest,
  type TradeExecuteResponse,
  type TradeRejectCode,
} from '@pirate-fruit/shared';
import { getRemoteSession } from '../session/RemoteSession';

export type TradeFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface RemoteTradeIntent {
  action: TradeAction;
  islandId: string;
  commodityId: string;
  quantity: number;
  expectedUnitPrice?: number;
}

export class RemoteTradeError extends Error {
  constructor(
    readonly code: TradeRejectCode | 'NETWORK',
    message: string,
  ) {
    super(message);
    this.name = 'RemoteTradeError';
  }
}

export interface RemoteTradeExecutor {
  execute(intent: RemoteTradeIntent): Promise<TradeExecuteResponse>;
}

function isTradeResponse(value: unknown): value is TradeExecuteResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TradeExecuteResponse>;
  return candidate.ok === true
    && candidate.schemaVersion === TRADE_PROTOCOL_SCHEMA_VERSION
    && typeof candidate.coins === 'number'
    && Number.isFinite(candidate.coins)
    && Array.isArray(candidate.cargo)
    && candidate.cargo.every(
      (slot) => slot
        && typeof slot.commodityId === 'string'
        && typeof slot.quantity === 'number',
    )
    && typeof candidate.unitPrice === 'number'
    && typeof candidate.total === 'number';
}

function newIdempotencyKey(): string {
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `trade:${suffix}`;
}

export function createRemoteTradeExecutor(
  apiUrl: string,
  csrfToken: string,
  fetcher: TradeFetch = globalThis.fetch.bind(globalThis),
): RemoteTradeExecutor {
  const baseUrl = apiUrl.replace(/\/+$/, '');

  async function post(body: TradeExecuteRequest): Promise<Response> {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), 8_000);
    try {
      return await fetcher(`${baseUrl}/api/trade/execute`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }

  return {
    async execute(intent: RemoteTradeIntent): Promise<TradeExecuteResponse> {
      const body: TradeExecuteRequest = {
        schemaVersion: TRADE_PROTOCOL_SCHEMA_VERSION,
        idempotencyKey: newIdempotencyKey(),
        ...intent,
      };
      // retry หนึ่งครั้งด้วย key เดิม — server มี idempotency จึงไม่เกิดธุรกรรมซ้ำ
      let response: Response;
      try {
        response = await post(body);
        if (response.status >= 500) response = await post(body);
      } catch {
        try {
          response = await post(body);
        } catch {
          throw new RemoteTradeError('NETWORK', 'เชื่อมต่อ Server ไม่ได้ ลองใหม่อีกครั้ง');
        }
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as {
          error?: { code?: string; message?: string };
        } | null;
        throw new RemoteTradeError(
          (payload?.error?.code as TradeRejectCode | undefined) ?? 'INVALID_TRADE_REQUEST',
          payload?.error?.message ?? `Trade rejected (${response.status})`,
        );
      }
      const payload: unknown = await response.json();
      if (!isTradeResponse(payload)) {
        throw new RemoteTradeError('INVALID_TRADE_REQUEST', 'Trade response is invalid');
      }
      return payload;
    },
  };
}

/**
 * ต่อ trade authority เมื่อ flag เปิด + session online เท่านั้น (คืน null = เล่นโหมด local เดิม)
 * ค่าเริ่มต้น production ยังปิด — เปิดโดยตั้ง VITE_ENABLE_TRADE_SERVER=true ตอน build
 */
export function initializeRemoteTrade(): RemoteTradeExecutor | null {
  const flag = import.meta.env.VITE_ENABLE_TRADE_SERVER;
  if (flag !== 'true' && flag !== '1') return null;
  const session = getRemoteSession();
  if (session.mode !== 'online' || !session.csrfToken) return null;
  const raw = import.meta.env.VITE_API_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return createRemoteTradeExecutor(url.toString(), session.csrfToken);
  } catch {
    return null;
  }
}
