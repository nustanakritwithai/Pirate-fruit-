/**
 * S10 — ส่ง quest intent ไปให้ Server ตัดสิน (สถานะเควสต์ + รางวัลเป็นของ Server)
 * เปิดใช้ด้วย VITE_ENABLE_QUEST_SERVER + ต้องมี Remote Session ที่ online เท่านั้น
 */

import {
  QUEST_PROTOCOL_SCHEMA_VERSION,
  type QuestAcceptResponse,
  type QuestClaimResponse,
  type QuestProgressEventPayload,
  type QuestProgressResponse,
  type QuestRejectCode,
  type QuestStateResponse,
} from '@pirate-fruit/shared';
import { getRemoteSession } from '../session/RemoteSession';

export type QuestFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export class RemoteQuestError extends Error {
  constructor(
    readonly code: QuestRejectCode | 'NETWORK',
    message: string,
  ) {
    super(message);
    this.name = 'RemoteQuestError';
  }
}

export interface RemoteQuestExecutor {
  state(): Promise<QuestStateResponse>;
  accept(questId: string, replaceActive: boolean): Promise<QuestAcceptResponse>;
  abandon(): Promise<void>;
  progress(events: QuestProgressEventPayload[]): Promise<QuestProgressResponse>;
  claim(questId: string, idempotencyKey: string): Promise<QuestClaimResponse>;
}

function hasSchema(value: unknown): value is { ok: true; schemaVersion: number } {
  return !!value
    && typeof value === 'object'
    && (value as { ok?: unknown }).ok === true
    && (value as { schemaVersion?: unknown }).schemaVersion === QUEST_PROTOCOL_SCHEMA_VERSION;
}

export function newQuestClaimKey(): string {
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `quest:${suffix}`;
}

export function createRemoteQuestExecutor(
  apiUrl: string,
  csrfToken: string,
  fetcher: QuestFetch = globalThis.fetch.bind(globalThis),
): RemoteQuestExecutor {
  const baseUrl = apiUrl.replace(/\/+$/, '');

  async function call(path: string, method: 'GET' | 'POST', body?: unknown): Promise<Response> {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), 8_000);
    try {
      return await fetcher(`${baseUrl}${path}`, {
        method,
        credentials: 'include',
        headers: {
          accept: 'application/json',
          ...(method === 'POST'
            ? { 'content-type': 'application/json', 'x-csrf-token': csrfToken }
            : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }

  /** retry หนึ่งครั้ง — mutation ทุกตัว idempotent ฝั่ง Server (claim ใช้ key เดิม) */
  async function exchange<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await call(path, method, body);
      if (response.status >= 500) response = await call(path, method, body);
    } catch {
      try {
        response = await call(path, method, body);
      } catch {
        throw new RemoteQuestError('NETWORK', 'เชื่อมต่อ Server ไม่ได้');
      }
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as {
        error?: { code?: string; message?: string };
      } | null;
      throw new RemoteQuestError(
        (payload?.error?.code as QuestRejectCode | undefined) ?? 'INVALID_QUEST_REQUEST',
        payload?.error?.message ?? `Quest request rejected (${response.status})`,
      );
    }
    const payload: unknown = await response.json();
    if (!hasSchema(payload)) {
      throw new RemoteQuestError('INVALID_QUEST_REQUEST', 'Quest response is invalid');
    }
    return payload as T;
  }

  return {
    state: () => exchange<QuestStateResponse>('/api/quest/state', 'GET'),
    accept: (questId, replaceActive) =>
      exchange<QuestAcceptResponse>('/api/quest/accept', 'POST', {
        schemaVersion: QUEST_PROTOCOL_SCHEMA_VERSION,
        questId,
        replaceActive,
      }),
    abandon: async () => {
      await exchange<{ ok: true }>('/api/quest/abandon', 'POST', {});
    },
    progress: (events) =>
      exchange<QuestProgressResponse>('/api/quest/progress', 'POST', {
        schemaVersion: QUEST_PROTOCOL_SCHEMA_VERSION,
        events,
      }),
    claim: (questId, idempotencyKey) =>
      exchange<QuestClaimResponse>('/api/quest/claim', 'POST', {
        schemaVersion: QUEST_PROTOCOL_SCHEMA_VERSION,
        questId,
        idempotencyKey,
      }),
  };
}

/**
 * ต่อ quest authority เมื่อ flag เปิด + session online เท่านั้น (คืน null = โหมด local เดิม)
 * ค่าเริ่มต้น production ยังปิด — เปิดโดยตั้ง VITE_ENABLE_QUEST_SERVER=true ตอน build
 */
export function initializeRemoteQuest(): RemoteQuestExecutor | null {
  const flag = import.meta.env.VITE_ENABLE_QUEST_SERVER;
  if (flag !== 'true' && flag !== '1') return null;
  const session = getRemoteSession();
  if (session.mode !== 'online' || !session.csrfToken) return null;
  const raw = import.meta.env.VITE_API_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return createRemoteQuestExecutor(url.toString(), session.csrfToken);
  } catch {
    return null;
  }
}
