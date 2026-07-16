import type { SessionIdentity, SessionResponse } from '@pirate-fruit/shared';
import {
  productionRemoteApiUrl,
  productionRemoteEnabled,
} from '../config/ProductionRemote';

export type SessionConnectionMode = 'disabled' | 'online' | 'offline';
export type SessionFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface RemoteSessionHandle {
  mode: SessionConnectionMode;
  session: SessionIdentity | null;
  csrfToken: string | null;
  created: boolean;
}

export interface RemoteSessionOptions {
  enabled?: boolean;
  apiUrl?: string;
  fetcher?: SessionFetch;
  requestTimeoutMs?: number;
  warn?: (message: string, error?: unknown) => void;
}

export interface RemoteSessionRecoveryOptions extends RemoteSessionOptions {
  attempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
}

const DISABLED_SESSION: RemoteSessionHandle = {
  mode: 'disabled',
  session: null,
  csrfToken: null,
  created: false,
};

let currentSession: RemoteSessionHandle = DISABLED_SESSION;

function enabled(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

function normalizeApiUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const base = typeof location === 'undefined' ? undefined : location.origin;
    const url = new URL(trimmed, base);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString().replace(/\/+$/, '')
      : null;
  } catch {
    return null;
  }
}

function isSessionResponse(value: unknown): value is SessionResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SessionResponse>;
  const session = candidate.session as Partial<SessionIdentity> | undefined;
  return (
    candidate.ok === true
    && typeof candidate.created === 'boolean'
    && typeof candidate.csrfToken === 'string'
    && /^[A-Za-z0-9_-]{43}$/.test(candidate.csrfToken)
    && typeof session?.userId === 'string'
    && typeof session.characterId === 'string'
    && typeof session.characterName === 'string'
    && typeof session.expiresAt === 'string'
    && Number.isFinite(Date.parse(session.expiresAt))
  );
}

async function sessionRequest(
  fetcher: SessionFetch,
  apiUrl: string,
  path: string,
  method: 'GET' | 'POST',
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(`${apiUrl}${path}`, {
      method,
      credentials: 'include',
      headers: {
        accept: 'application/json',
        ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
      },
      ...(method === 'POST' ? { body: '{}' } : {}),
      signal: controller.signal,
    });
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

async function parseSession(response: Response): Promise<SessionResponse> {
  if (!response.ok) throw new Error(`Remote session request failed (${response.status})`);
  const payload: unknown = await response.json();
  if (!isSessionResponse(payload)) throw new Error('Remote session response is invalid');
  return payload;
}

export async function initializeRemoteSession(
  options: RemoteSessionOptions = {},
): Promise<RemoteSessionHandle> {
  const shouldConnect = options.enabled
    ?? (enabled(import.meta.env.VITE_ENABLE_REMOTE_SESSION) || productionRemoteEnabled());
  if (!shouldConnect) {
    currentSession = DISABLED_SESSION;
    return currentSession;
  }

  const apiUrl = normalizeApiUrl(
    options.apiUrl ?? (import.meta.env.VITE_API_URL || productionRemoteApiUrl()),
  );
  const warn = options.warn
    ?? ((message: string, error?: unknown) => console.warn(message, error));
  if (!apiUrl) {
    warn('Remote session is enabled but VITE_API_URL is missing or invalid.');
    currentSession = { ...DISABLED_SESSION, mode: 'offline' };
    return currentSession;
  }

  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const requestTimeoutMs = Math.max(1_000, options.requestTimeoutMs ?? 6_000);
  try {
    let response = await sessionRequest(
      fetcher,
      apiUrl,
      '/api/session/me',
      'GET',
      requestTimeoutMs,
    );
    if (response.status === 401) {
      response = await sessionRequest(
        fetcher,
        apiUrl,
        '/api/session/guest',
        'POST',
        requestTimeoutMs,
      );
    }
    const payload = await parseSession(response);
    currentSession = {
      mode: 'online',
      session: payload.session,
      csrfToken: payload.csrfToken,
      created: payload.created,
    };
  } catch (error) {
    warn('Remote session is unavailable; continuing in Local mode.', error);
    currentSession = { ...DISABLED_SESSION, mode: 'offline' };
  }
  return currentSession;
}

/**
 * Render Free services can need around a minute to wake. Gameplay keeps its Local
 * fallback while this bounded loop retries the same cookie-authenticated bootstrap.
 */
export async function recoverRemoteSession(
  options: RemoteSessionRecoveryOptions = {},
): Promise<RemoteSessionHandle> {
  if (currentSession.mode === 'online') return currentSession;

  const attempts = Math.max(1, options.attempts ?? 8);
  const initialDelayMs = Math.max(0, options.initialDelayMs ?? 2_000);
  const maxDelayMs = Math.max(initialDelayMs, options.maxDelayMs ?? 15_000);
  const sleep = options.sleep
    ?? ((delayMs: number) => new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, delayMs);
    }));
  const warn = options.warn
    ?? ((message: string, error?: unknown) => console.warn(message, error));

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      await sleep(Math.min(maxDelayMs, initialDelayMs * (2 ** (attempt - 1))));
    }
    const result = await initializeRemoteSession({
      ...options,
      warn: attempt === attempts - 1 ? warn : () => undefined,
    });
    if (result.mode === 'online' || result.mode === 'disabled') return result;
  }
  return currentSession;
}

export function getRemoteSession(): RemoteSessionHandle {
  return currentSession;
}

export function getRemoteCsrfToken(): string | null {
  return currentSession.csrfToken;
}
