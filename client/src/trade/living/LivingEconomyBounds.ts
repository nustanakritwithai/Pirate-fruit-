import type { EconomyEventPriority } from './EconomyEventClassifier';
import { ECONOMY_GENOME_CONFIG } from './EconomyGenomeConfig';
import { PLAYER_REPUTATION_CONFIG } from './PlayerReputationConfig';
import type { DynamicTradeOrder, EconomyWorldState, TradeNewsItem } from './types';

/** Living Economy Core v1.0 — bounded in-memory collections */
export const LIVING_ECONOMY_BOUNDS = {
  maxEconomyLogEntries: 200,
  maxNewsEntries: 100,
  maxDebugSamples: 300,
  maxArchivedOrders: 120,
} as const;

export function pushBounded<T>(list: T[], value: T, maximum: number): void {
  list.push(value);
  if (list.length > maximum) {
    list.splice(0, list.length - maximum);
  }
}

export function prependBounded<T>(list: readonly T[], values: readonly T[], maximum: number): T[] {
  const merged = [...values, ...list];
  return merged.length > maximum ? merged.slice(0, maximum) : merged;
}

function priorityRank(p?: EconomyEventPriority): number {
  switch (p) {
    case 'critical': return 5;
    case 'high': return 4;
    case 'medium': return 3;
    case 'low': return 2;
    case 'silent': return 1;
    default: return 0;
  }
}

function higherPriority(
  a?: EconomyEventPriority,
  b?: EconomyEventPriority,
): EconomyEventPriority | undefined {
  return priorityRank(b) > priorityRank(a) ? b : a;
}

export function newsDedupKey(item: TradeNewsItem): string {
  const normalized = item.message.replace(/\d+/g, '#');
  return `${item.cellId ?? 'none'}|${item.commodityId ?? 'none'}|${normalized.slice(0, 48)}`;
}

/** Merge near-duplicate news instead of stacking identical headlines every tick. */
export function mergeNewsBatch(
  existing: readonly TradeNewsItem[],
  incoming: readonly TradeNewsItem[],
  maximum: number,
): TradeNewsItem[] {
  const result: TradeNewsItem[] = [...existing];
  for (const item of incoming) {
    const key = newsDedupKey(item);
    const idx = result.findIndex((n) => newsDedupKey(n) === key);
    if (idx >= 0) {
      const prev = result[idx];
      result[idx] = {
        ...prev,
        createdAt: item.createdAt,
        message: item.message,
        priority: higherPriority(prev.priority, item.priority),
      };
      if (idx > 0) {
        const [merged] = result.splice(idx, 1);
        result.unshift(merged);
      }
    } else {
      result.unshift(item);
    }
    if (result.length > maximum) {
      result.length = maximum;
    }
  }
  return result;
}

function isActiveOrder(order: DynamicTradeOrder): boolean {
  return order.status === 'open' || order.status === 'assigned' || order.status === 'in-transit';
}

export function trimEconomyWorldState(world: EconomyWorldState): void {
  if (world.log.length > LIVING_ECONOMY_BOUNDS.maxEconomyLogEntries) {
    world.log = world.log.slice(0, LIVING_ECONOMY_BOUNDS.maxEconomyLogEntries);
  }

  if (world.news.length > LIVING_ECONOMY_BOUNDS.maxNewsEntries) {
    world.news = world.news.slice(0, LIVING_ECONOMY_BOUNDS.maxNewsEntries);
  }

  const activeOrders = world.orders.filter(isActiveOrder);
  const archived = world.orders
    .filter((o) => !isActiveOrder(o))
    .slice(-LIVING_ECONOMY_BOUNDS.maxArchivedOrders);
  world.orders = [...activeOrders, ...archived];

  const pe = world.playerEconomy;
  if (pe) {
    if (pe.tradeHistory.length > PLAYER_REPUTATION_CONFIG.maxSavedPlayerTradeHistory) {
      pe.tradeHistory = pe.tradeHistory.slice(0, PLAYER_REPUTATION_CONFIG.maxSavedPlayerTradeHistory);
    }
    if (pe.contractHistory.length > PLAYER_REPUTATION_CONFIG.maxSavedContractsHistory) {
      pe.contractHistory = pe.contractHistory.slice(0, PLAYER_REPUTATION_CONFIG.maxSavedContractsHistory);
    }
  }

  const gs = world.genomeState;
  if (gs) {
    if (gs.genomePressures.length > ECONOMY_GENOME_CONFIG.maximumPressureLogSamples) {
      gs.genomePressures = gs.genomePressures
        .sort((a, b) => b.lastUpdatedTick - a.lastUpdatedTick)
        .slice(0, ECONOMY_GENOME_CONFIG.maximumPressureLogSamples);
    }
    if (gs.evolutionHistory.length > ECONOMY_GENOME_CONFIG.maximumEvolutionHistoryEntries) {
      gs.evolutionHistory = gs.evolutionHistory.slice(
        0,
        ECONOMY_GENOME_CONFIG.maximumEvolutionHistoryEntries,
      );
    }
  }
}
