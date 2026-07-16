const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);

export function requireDatabaseUrl(
  source: Record<string, string | undefined> = process.env,
): string {
  const databaseUrl = source.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
  }

  if (!POSTGRES_PROTOCOLS.has(parsed.protocol)) {
    throw new Error('DATABASE_URL must use the postgres or postgresql protocol');
  }

  return databaseUrl;
}
