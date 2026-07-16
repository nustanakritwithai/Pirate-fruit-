import { describe, expect, it } from 'vitest';
import { allowedOrigins, loadEnvironment } from './environment.js';

describe('server environment', () => {
  it('provides safe local defaults', () => {
    const environment = loadEnvironment({ NODE_ENV: 'test' });

    expect(environment.HOST).toBe('0.0.0.0');
    expect(environment.PORT).toBe(10_000);
    expect(environment.ENABLE_REMOTE_SESSION).toBe(false);
    expect(environment.SESSION_TTL_DAYS).toBe(30);
    expect(environment.ENABLE_ECONOMY_SERVER).toBe(false);
    expect(environment.ENABLE_REMOTE_SAVE).toBe(false);
  });

  it('parses feature flags and comma-separated origins', () => {
    const environment = loadEnvironment({
      NODE_ENV: 'test',
      CLIENT_ORIGIN: 'https://game.example, https://preview.example',
      ENABLE_ECONOMY_SERVER: 'true',
      ENABLE_REMOTE_SESSION: 'yes',
      ENABLE_REMOTE_SAVE: '1',
      DATABASE_URL: 'postgresql://user:password@localhost:5432/pirate_fruit',
      SESSION_SECRET: 's'.repeat(32),
    });

    expect(environment.ENABLE_ECONOMY_SERVER).toBe(true);
    expect(environment.ENABLE_REMOTE_SESSION).toBe(true);
    expect(environment.ENABLE_REMOTE_SAVE).toBe(true);
    expect([...allowedOrigins(environment)]).toEqual([
      'https://game.example',
      'https://preview.example',
    ]);
  });

  it('requires database and secret whenever remote sessions are enabled', () => {
    expect(() =>
      loadEnvironment({ NODE_ENV: 'test', ENABLE_REMOTE_SESSION: 'true' }),
    ).toThrow(/DATABASE_URL.*SESSION_SECRET/);
  });

  it('does not allow Remote Save to bypass the Remote Session identity gate', () => {
    expect(() => loadEnvironment({
      NODE_ENV: 'test',
      ENABLE_REMOTE_SAVE: 'true',
      DATABASE_URL: 'postgresql://localhost/pirate_fruit_test',
    })).toThrow(/ENABLE_REMOTE_SESSION/);
  });

  it('requires PostgreSQL whenever the living economy Server is enabled', () => {
    expect(() => loadEnvironment({
      NODE_ENV: 'test',
      ENABLE_ECONOMY_SERVER: 'true',
    })).toThrow(/DATABASE_URL/);
  });

  it('requires database and session secrets in production', () => {
    expect(() =>
      loadEnvironment({
        NODE_ENV: 'production',
        CLIENT_ORIGIN: 'https://game.example',
      }),
    ).toThrow(/DATABASE_URL.*SESSION_SECRET/);
  });

  it('accepts a complete production environment', () => {
    const environment = loadEnvironment({
      NODE_ENV: 'production',
      CLIENT_ORIGIN: 'https://game.example',
      DATABASE_URL: 'postgresql://user:password@database.internal:5432/pirate_fruit',
      SESSION_SECRET: 'a'.repeat(32),
    });

    expect(environment.NODE_ENV).toBe('production');
  });
});
