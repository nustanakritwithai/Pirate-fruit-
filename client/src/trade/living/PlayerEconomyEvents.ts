import type { PlayerEconomyEvent, PlayerEconomyEventType } from './PlayerEconomyTypes';

const listeners = new Set<(event: PlayerEconomyEvent) => void>();

export function subscribePlayerEconomyEvents(
  listener: (event: PlayerEconomyEvent) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitPlayerEconomyEvent(event: PlayerEconomyEvent): void {
  for (const listener of listeners) listener(event);
}

export function emitPlayerEconomyEvents(events: PlayerEconomyEvent[]): void {
  for (const event of events) emitPlayerEconomyEvent(event);
}

export function classifyPlayerEventPriority(
  type: PlayerEconomyEventType,
): 'silent' | 'toast' | 'critical' {
  switch (type) {
    case 'PLAYER_CONTRACT_ACCEPTED':
    case 'PLAYER_CONTRACT_COMPLETED':
    case 'PLAYER_ECONOMIC_TITLE_CHANGED':
    case 'PLAYER_RESOLVED_CRISIS':
    case 'PLAYER_CAUSED_SHORTAGE':
      return 'toast';
    case 'PLAYER_CAUSED_CRISIS':
    case 'PLAYER_CONTRACT_FAILED':
      return 'critical';
    default:
      return 'silent';
  }
}
