import { LivingTradeSimulator } from '../../client/src/trade/living/LivingTradeSimulator';
import {
  LIVING_ECONOMY_SAVE_VERSION,
  createFreshWorld,
  parseEconomyDocument,
  serializeEconomyState,
} from '../../client/src/trade/living/LivingTradePersistence';

export interface BundledEconomySnapshot {
  tick: number;
  documentVersion: number;
  document: Record<string, unknown>;
}

function decode(document: unknown) {
  if (document === null || document === undefined) return null;
  try {
    const raw = typeof document === 'string' ? document : JSON.stringify(document);
    return parseEconomyDocument(raw);
  } catch {
    return null;
  }
}

/**
 * The Server bundles this entry from the existing gameplay simulation source.
 * That keeps formula/config drift impossible while S7 moves the clock and storage
 * authority to PostgreSQL. Rendering and browser-only UI modules are not bundled.
 */
export function createEconomyEngine(initialDocument?: unknown) {
  const initialWorld = decode(initialDocument) ?? createFreshWorld();
  const simulator = new LivingTradeSimulator({
    initialWorld,
    persist: () => undefined,
  });

  return {
    get tick(): number {
      return simulator.state.tick;
    },
    advance(): void {
      simulator.tick();
    },
    snapshot(): BundledEconomySnapshot {
      const serialized = serializeEconomyState(simulator.state);
      return {
        tick: simulator.state.tick,
        documentVersion: LIVING_ECONOMY_SAVE_VERSION,
        document: JSON.parse(serialized) as Record<string, unknown>,
      };
    },
  };
}
