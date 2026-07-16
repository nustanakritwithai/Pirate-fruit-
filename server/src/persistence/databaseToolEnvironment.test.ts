import { describe, expect, it } from 'vitest';
import { requireDatabaseUrl } from './databaseToolEnvironment.js';

describe('database tool environment', () => {
  it('accepts PostgreSQL connection URLs', () => {
    expect(
      requireDatabaseUrl({ DATABASE_URL: 'postgresql://user:pass@localhost:5432/pirate_fruit' }),
    ).toBe('postgresql://user:pass@localhost:5432/pirate_fruit');
  });

  it('rejects missing, malformed, or non-PostgreSQL URLs', () => {
    expect(() => requireDatabaseUrl({})).toThrow(/DATABASE_URL is required/);
    expect(() => requireDatabaseUrl({ DATABASE_URL: 'not-a-url' })).toThrow(/valid PostgreSQL/);
    expect(() => requireDatabaseUrl({ DATABASE_URL: 'https://database.example' })).toThrow(
      /postgres or postgresql/,
    );
  });
});
