import type { SessionIdentity, SessionResponse } from '@pirate-fruit/shared';

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
  warn?: (message: string, error?: unknown) => void;
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
): Promise<Response> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 6_000);
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
    ?? enabled(import.meta.env.VITE_ENABLE_REMOTE_SESSION);
  if (!shouldConnect) {
    currentSession = DISABLED_SESSION;
    return currentSession;
  }

  const apiUrl = normalizeApiUrl(options.apiUrl ?? import.meta.env.VITE_API_URL);
  const warn = options.warn
    ?? ((message: string, error?: unknown) => console.warn(message, error));
  if (!apiUrl) {
    warn('Remote session is enabled but VITE_API_URL is missing or invalid.');
    currentSession = { ...DISABLED_SESSION, mode: 'offline' };
    return currentSession;
  }

  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  try {
    let response = await sessionRequest(fetcher, apiUrl, '/api/session/me', 'GET');
    if (response.status === 401) {
      response = await sessionRequest(fetcher, apiUrl, '/api/session/guest', 'POST');
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

export function getRemoteSession(): RemoteSessionHandle {
  return currentSession;
}

export function getRemoteCsrfToken(): string | null {
  return currentSession.csrfToken;
}
