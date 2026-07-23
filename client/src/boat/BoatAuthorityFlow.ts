import type { GameStorage } from '../persistence/GameStorage';
import type { BoatIntentAction } from '@pirate-fruit/shared';

export interface SummonAuthority {
  connected(): boolean;
  send(action: BoatIntentAction): string | null;
}

/**
 * Boat ownership/selection is persisted through the debounced Remote Save mirror.
 * Flush it before summon so the Server reads the boat selected by the same click flow.
 */
export async function flushAndSendSummon(
  storage: GameStorage,
  authority: SummonAuthority,
): Promise<string | null> {
  await storage.flush?.();
  if (!authority.connected()) return null;
  return authority.send('summon');
}
