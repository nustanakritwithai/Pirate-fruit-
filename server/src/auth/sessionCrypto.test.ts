import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createCsrfToken,
  csrfTokenMatches,
  hashSessionToken,
} from './sessionCrypto.js';

describe('sessionCrypto', () => {
  const secret = 's'.repeat(32);

  it('creates deterministic CSRF tokens for the same session inputs', () => {
    const tokenHash = hashSessionToken('raw-session-token-012345678901234567890');
    const first = createCsrfToken(secret, 'session-a', tokenHash);
    const second = createCsrfToken(secret, 'session-a', tokenHash);
    expect(first).toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('rejects CSRF tokens with the wrong length or charset', () => {
    const expected = createCsrfToken(secret, 'session-a', hashSessionToken('token-a'));
    expect(csrfTokenMatches(expected, expected)).toBe(true);
    expect(csrfTokenMatches(expected, `${expected}x`)).toBe(false);
    expect(csrfTokenMatches(expected, expected.slice(0, -1))).toBe(false);
    expect(csrfTokenMatches(expected, 'not-a-valid-csrf-token')).toBe(false);
    expect(csrfTokenMatches(expected, null)).toBe(false);
  });

  it('compares CSRF tokens with timing-safe equality', () => {
    const expected = createCsrfToken(secret, 'session-a', hashSessionToken('token-a'));
    const tampered = createHmac('sha256', secret)
      .update('pirate-fruit:csrf:session-a:other-hash', 'utf8')
      .digest('base64url');
    expect(tampered).toHaveLength(expected.length);
    expect(csrfTokenMatches(expected, tampered)).toBe(false);
  });
});
