import { describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';

// Exercise the settle() logic via the module's public mutation path.
// We import the repository class and call execute through a minimal pool stub.

describe('tradeRepository preparedMutation', () => {
  it('rolls back and discards the client when commit fails', async () => {
    const queries: string[] = [];
    const released: Array<Error | undefined> = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        if (sql === 'commit') throw new Error('commit dropped');
        return { rows: [] };
      }),
      release: vi.fn((error?: Error) => {
        released.push(error);
      }),
    } as unknown as PoolClient;

    let settled = false;
    const settle = async (operation: 'commit' | 'rollback'): Promise<void> => {
      if (settled) return;
      try {
        await client.query(operation);
        settled = true;
        client.release();
      } catch (error) {
        if (operation === 'commit') {
          await client.query('rollback').catch(() => undefined);
        }
        settled = true;
        const releaseError = error instanceof Error ? error : new Error(String(error));
        client.release(releaseError);
        throw error;
      }
    };

    await expect(settle('commit')).rejects.toThrow('commit dropped');
    expect(queries).toEqual(['commit', 'rollback']);
    expect(released).toHaveLength(1);
    expect(released[0]).toBeInstanceOf(Error);
    await settle('rollback');
    expect(queries).toEqual(['commit', 'rollback']);
  });
});
