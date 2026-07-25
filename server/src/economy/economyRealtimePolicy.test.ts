import { describe, expect, it } from 'vitest';
import { shouldBroadcastEconomySnapshot } from './economyRealtimePolicy.js';

describe('economy realtime snapshot policy', () => {
  it('keeps five-second simulation ticks off browser render threads', () => {
    expect(shouldBroadcastEconomySnapshot('tick')).toBe(false);
  });

  it.each(['initialize', 'mutation', 'rollback'] as const)(
    'publishes canonical state after %s persistence',
    (reason) => {
      expect(shouldBroadcastEconomySnapshot(reason)).toBe(true);
    },
  );
});
