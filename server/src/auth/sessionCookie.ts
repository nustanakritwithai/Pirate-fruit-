import type { CookieSerializeOptions } from '@fastify/cookie';
import type { ServerEnvironment } from '../config/environment.js';

export function sessionCookieName(environment: ServerEnvironment): string {
  return environment.NODE_ENV === 'production' ? '__Host-pf_session' : 'pf_session';
}

export function sessionCookieOptions(
  environment: ServerEnvironment,
  expiresAt: Date,
): CookieSerializeOptions {
  const production = environment.NODE_ENV === 'production';
  return {
    path: '/',
    httpOnly: true,
    secure: production,
    sameSite: production ? 'none' : 'lax',
    partitioned: production,
    priority: 'high',
    expires: expiresAt,
    maxAge: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1_000)),
  };
}

export function expiredSessionCookieOptions(
  environment: ServerEnvironment,
): CookieSerializeOptions {
  const production = environment.NODE_ENV === 'production';
  return {
    path: '/',
    httpOnly: true,
    secure: production,
    sameSite: production ? 'none' : 'lax',
    partitioned: production,
    expires: new Date(0),
    maxAge: 0,
  };
}
