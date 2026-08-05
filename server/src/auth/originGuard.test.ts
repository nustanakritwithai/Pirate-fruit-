import { describe, expect, it } from 'vitest';
import { rejectUntrustedOrigin } from './originGuard.js';
import { loadEnvironment } from '../config/environment.js';

describe('originGuard', () => {
  it('rejects missing Origin when strict origin mode is enabled', async () => {
    const environment = loadEnvironment({
      NODE_ENV: 'test',
      STRICT_ORIGIN_MODE: 'true',
      CLIENT_ORIGIN: 'https://game.example',
    });
    const request = { id: 'req-1', headers: {} } as never;
    let status = 0;
    let body: unknown;
    const reply = {
      status(code: number) {
        status = code;
        return this;
      },
      async send(payload: unknown) {
        body = payload;
      },
    } as never;
    const rejected = await rejectUntrustedOrigin(
      request,
      reply,
      environment,
      (_request, code, message) => ({ ok: false, error: { code, message, requestId: 'req-1' } }),
    );
    expect(rejected).toBe(true);
    expect(status).toBe(403);
    expect(body).toMatchObject({ error: { code: 'UNTRUSTED_ORIGIN' } });
  });
});
