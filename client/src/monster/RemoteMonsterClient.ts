/**
 * S11 — รายงานการฆ่ามอนสเตอร์ให้ Server คิดรางวัล (เลขรางวัลเป็นของ Server)
 * เปิดใช้ด้วย VITE_ENABLE_MONSTER_SERVER + ต้องมี Remote Session ที่ online เท่านั้น
 */

import {
  MONSTER_PROTOCOL_SCHEMA_VERSION,
  type MonsterKillEntry,
  type MonsterKillsResponse,
  type MonsterRejectCode,
} from '@pirate-fruit/shared';
import { getRemoteSession } from '../session/RemoteSession';

export type MonsterFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class RemoteMonsterError extends Error {
  constructor(
    readonly code: MonsterRejectCode | 'NETWORK',
    message: string,
  ) {
    super(message);
    this.name = 'RemoteMonsterError';
  }
}

export interface RemoteMonsterExecutor {
  reportKills(kills: MonsterKillEntry[], idempotencyKey: string): Promise<MonsterKillsResponse>;
}

export function newKillBatchKey(): string {
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `kills:${suffix}`;
}

function isKillsResponse(value: unknown): value is MonsterKillsResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<MonsterKillsResponse>;
  return candidate.ok === true
    && candidate.schemaVersion === MONSTER_PROTOCOL_SCHEMA_VERSION
    && Array.isArray(candidate.rewards)
    && typeof candidate.coinsTotal === 'number';
}

export function createRemoteMonsterExecutor(
  apiUrl: string,
  csrfToken: string,
  fetcher: MonsterFetch = globalThis.fetch.bind(globalThis),
): RemoteMonsterExecutor {
  const baseUrl = apiUrl.replace(/\/+$/, '');

  async function post(body: unknown): Promise<Response> {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), 8_000);
    try {
      return await fetcher(`${baseUrl}/api/monster/kills`, {
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
    async reportKills(kills, idempotencyKey) {
      const body = {
        schemaVersion: MONSTER_PROTOCOL_SCHEMA_VERSION,
        idempotencyKey,
        kills,
      };
      // retry หนึ่งครั้งด้วย key เดิม — server มี idempotency จึงไม่แจกซ้ำ
      let response: Response;
      try {
        response = await post(body);
        if (response.status >= 500) response = await post(body);
      } catch {
        try {
          response = await post(body);
        } catch {
          throw new RemoteMonsterError('NETWORK', 'เชื่อมต่อ Server ไม่ได้');
        }
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as {
          error?: { code?: string; message?: string };
        } | null;
        throw new RemoteMonsterError(
          (payload?.error?.code as MonsterRejectCode | undefined) ?? 'INVALID_MONSTER_REQUEST',
          payload?.error?.message ?? `Kill report rejected (${response.status})`,
        );
      }
      const payload: unknown = await response.json();
      if (!isKillsResponse(payload)) {
        throw new RemoteMonsterError('INVALID_MONSTER_REQUEST', 'Kill response is invalid');
      }
      return payload;
    },
  };
}

/**
 * ต่อ monster reward authority เมื่อ flag เปิด + session online เท่านั้น
 * (คืน null = แจกรางวัลแบบ local เดิม) — ค่าเริ่มต้น production ยังปิด
 */
export function initializeRemoteMonster(): RemoteMonsterExecutor | null {
  const flag = import.meta.env.VITE_ENABLE_MONSTER_SERVER;
  if (flag !== 'true' && flag !== '1') return null;
  const session = getRemoteSession();
  if (session.mode !== 'online' || !session.csrfToken) return null;
  const raw = import.meta.env.VITE_API_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return createRemoteMonsterExecutor(url.toString(), session.csrfToken);
  } catch {
    return null;
  }
}
