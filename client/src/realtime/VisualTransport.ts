import type { RealtimePlayerVisual } from '@pirate-fruit/shared';

/**
 * The iframe's parent bridge is the presentation transport when it exists.
 * Keep the legacy direct realtime pose alive, but do not let it consume or
 * duplicate one-shot visual events before the parent can publish them.
 */
export function visualForDirectRealtime(
  parentPresenceActive: boolean,
  visual: RealtimePlayerVisual,
): RealtimePlayerVisual | undefined {
  return parentPresenceActive ? undefined : visual;
}

export function shouldAcknowledgeDirectVisual(
  parentPresenceActive: boolean,
  sent: boolean,
): boolean {
  return sent && !parentPresenceActive;
}
