import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getRemoteSession,
  initializeRemoteSession,
  recoverRemoteSession,
  type SessionFetch,
} from '../RemoteSession';

const sessionPayload = {
  ok: true,
  created: false,
  session: {
    userId: 'user-1',
    characterId: 'character-1',
    characterName: 'Guest-character',
    expiresAt: '2026-08-15T00:00:00.000Z',
  },
  csrfToken: 'a'.repeat(43),
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(async () => {
  await initializeRemoteSession({ enabled: false });
});

describe('remote guest session bootstrap', () => {
  it('does not contact the server while the feature flag is disabled', async () => {
    const fetcher = vi.fn<SessionFetch>();
    const result = await initializeRemoteSession({ enabled: false, fetcher });

    expect(result.mode).toBe('disabled');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('resumes an existing HttpOnly-cookie session', async () => {
    const fetcher = vi.fn<SessionFetch>(async () => jsonResponse(sessionPayload));
    const result = await initializeRemoteSession({
      enabled: true,
      apiUrl: 'https://server.example/',
      fetcher,
    });

    expect(result).toMatchObject({ mode: 'online', created: false, session: sessionPayload.session });
    expect(getRemoteSession()).toEqual(result);
    expect(fetcher).toHaveBeenCalledWith(
      'https://server.example/api/session/me',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  it('creates one guest after the server reports no current session', async () => {
    const created = { ...sessionPayload, created: true };
    const fetcher = vi
      .fn<SessionFetch>()
      .mockResolvedValueOnce(jsonResponse({ ok: false }, 401))
      .mockResolvedValueOnce(jsonResponse(created, 201));
    const result = await initializeRemoteSession({
      enabled: true,
      apiUrl: 'https://server.example',
      fetcher,
    });

    expect(result).toMatchObject({ mode: 'online', created: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]).toEqual([
      'https://server.example/api/session/guest',
      expect.objectContaining({ method: 'POST', credentials: 'include', body: '{}' }),
    ]);
  });

  it('falls back without blocking gameplay when the server response is invalid', async () => {
    const warn = vi.fn();
    const result = await initializeRemoteSession({
      enabled: true,
      apiUrl: 'https://server.example',
      fetcher: async () => jsonResponse({ ok: true }),
      warn,
    });

    expect(result).toEqual({ mode: 'offline', session: null, csrfToken: null, created: false });
    expect(warn).toHaveBeenCalledOnce();
  });

  it('recovers automatically after transient Render wake-up failures', async () => {
    const fetcher = vi
      .fn<SessionFetch>()
      .mockRejectedValueOnce(new TypeError('sleeping'))
      .mockRejectedValueOnce(new TypeError('still waking'))
      .mockResolvedValueOnce(jsonResponse(sessionPayload));
    const sleep = vi.fn(async () => undefined);

    const result = await recoverRemoteSession({
      enabled: true,
      apiUrl: 'https://server.example',
      fetcher,
      attempts: 3,
      initialDelayMs: 1,
      maxDelayMs: 2,
      sleep,
    });

    expect(result.mode).toBe('online');
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
