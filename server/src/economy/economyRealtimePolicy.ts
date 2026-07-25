import type { EconomyPersistReason } from './economyRuntime.js';

/**
 * The five-second economy simulation tick is server-side background work. Sending the
 * complete world document after every tick makes every connected browser parse and
 * migrate a large snapshot on its render thread at the same cadence.
 *
 * Mutations still publish immediately so an open trade screen receives canonical stock
 * after a transaction. Initial state is loaded through the economy REST bootstrap.
 */
export function shouldBroadcastEconomySnapshot(reason: EconomyPersistReason): boolean {
  return reason !== 'tick';
}
