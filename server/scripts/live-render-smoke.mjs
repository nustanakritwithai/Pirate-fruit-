const API_URL = 'https://pirate-fruit-server.onrender.com';
const CLIENT_ORIGIN = 'https://pirate-fruit-u555.onrender.com';

const report = {};

async function request(path, init = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    signal: AbortSignal.timeout(75_000),
    headers: {
      accept: 'application/json',
      origin: CLIENT_ORIGIN,
      ...(init.headers ?? {}),
    },
  });
  let body = null;
  if (response.status !== 204) {
    body = await response.json().catch(() => null);
  }
  return { response, body };
}

function cookiePair(setCookie) {
  return setCookie?.split(';', 1)[0] ?? null;
}

function apiCode(body) {
  return body?.error?.code ?? null;
}

try {
  const ready = await request('/ready');
  report.ready = {
    status: ready.response.status,
    ok: ready.body?.ok === true,
    database: ready.body?.database ?? null,
    version: ready.body?.version ?? null,
  };

  const preflight = await request('/api/session/guest', {
    method: 'OPTIONS',
    headers: {
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    },
  });
  report.preflight = {
    status: preflight.response.status,
    allowOrigin: preflight.response.headers.get('access-control-allow-origin') === CLIENT_ORIGIN,
    allowCredentials: preflight.response.headers.get('access-control-allow-credentials') === 'true',
  };

  const guest = await request('/api/session/guest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  const setCookie = guest.response.headers.get('set-cookie');
  const cookie = cookiePair(setCookie);
  report.guest = {
    status: guest.response.status,
    ok: guest.body?.ok === true,
    code: apiCode(guest.body),
    csrfIssued: typeof guest.body?.csrfToken === 'string' && guest.body.csrfToken.length > 0,
    cookieIssued: Boolean(cookie),
    cookieHttpOnly: /;\s*HttpOnly(?:;|$)/i.test(setCookie ?? ''),
    cookieSecure: /;\s*Secure(?:;|$)/i.test(setCookie ?? ''),
    cookieSameSiteNone: /;\s*SameSite=None(?:;|$)/i.test(setCookie ?? ''),
    cookiePartitioned: /;\s*Partitioned(?:;|$)/i.test(setCookie ?? ''),
    allowOrigin: guest.response.headers.get('access-control-allow-origin') === CLIENT_ORIGIN,
    allowCredentials: guest.response.headers.get('access-control-allow-credentials') === 'true',
  };

  if (!cookie) throw new Error('Guest session did not issue a cookie');

  const authenticatedHeaders = { cookie };
  const me = await request('/api/session/me', { headers: authenticatedHeaders });
  report.sessionMe = {
    status: me.response.status,
    ok: me.body?.ok === true,
    code: apiCode(me.body),
  };

  const player = await request('/api/player/state', { headers: authenticatedHeaders });
  report.playerState = {
    status: player.response.status,
    ok: player.body?.ok === true,
    code: apiCode(player.body),
    revision: Number.isInteger(player.body?.revision) ? player.body.revision : null,
  };

  const economy = await request('/api/economy/world');
  report.economy = {
    status: economy.response.status,
    ok: economy.body?.ok === true,
    code: apiCode(economy.body),
    tick: Number.isInteger(economy.body?.tick) ? economy.body.tick : null,
  };

  const passed = report.ready.ok
    && report.ready.database === 'ready'
    && report.preflight.status < 400
    && report.preflight.allowOrigin
    && report.preflight.allowCredentials
    && report.guest.ok
    && report.guest.csrfIssued
    && report.guest.cookieIssued
    && report.guest.cookieHttpOnly
    && report.guest.cookieSecure
    && report.guest.cookieSameSiteNone
    && report.guest.cookiePartitioned
    && report.guest.allowOrigin
    && report.guest.allowCredentials
    && report.sessionMe.ok
    && report.playerState.ok
    && report.economy.ok;

  console.log(JSON.stringify({ passed, report }, null, 2));
  if (!passed) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({
    passed: false,
    report,
    failure: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
}
