import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const RAW_SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CSRF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function createRawSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function isRawSessionToken(value: unknown): value is string {
  return typeof value === 'string' && RAW_SESSION_TOKEN_PATTERN.test(value);
}

export function hashSessionToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export function createCsrfToken(
  secret: string,
  sessionId: string,
  tokenHash: string,
): string {
  return createHmac('sha256', secret)
    .update(`pirate-fruit:csrf:${sessionId}:${tokenHash}`, 'utf8')
    .digest('base64url');
}

export function csrfTokenMatches(expected: string, received: unknown): boolean {
  if (typeof received !== 'string' || !CSRF_TOKEN_PATTERN.test(received)) return false;
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(received, 'utf8');
  return (
    expectedBuffer.length === receivedBuffer.length
    && timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}
