import type { IslandId } from '../../island/IslandTypes';
import type { EconomyLogEntry, EconomyWorldState } from './types';
import { ensurePlayerEconomy } from './PlayerEconomicProfileManager';
import { generatePlayerContracts } from './PlayerContractGenerator';
import { tickPlayerContracts } from './PlayerContractManager';
import { tickReputationDecay } from './PlayerReputationManager';
import { emitPlayerEconomyEvents } from './PlayerEconomyEvents';
import type { PlayerEconomyEvent } from './PlayerEconomyTypes';
import type { ContractWallet } from './PlayerContractManager';

export function updatePlayerEconomy(
  world: EconomyWorldState,
  log: EconomyLogEntry[],
  wallet?: ContractWallet,
): PlayerEconomyEvent[] {
  const pe = ensurePlayerEconomy(world);
  const events: PlayerEconomyEvent[] = [];

  tickReputationDecay(pe.profile, 1);

  const contractEvents = generatePlayerContracts(world);
  events.push(...contractEvents);

  const tickEvents = tickPlayerContracts(world, wallet);
  events.push(...tickEvents);

  for (const event of events) {
    if (event.type === 'PLAYER_CONTRACT_AVAILABLE') {
      log.push({
        tick: world.tick,
        message: `[สัญญา] ${event.message}`,
      });
    }
    if (event.type === 'PLAYER_RESOLVED_CRISIS') {
      log.push({
        tick: world.tick,
        message: `ผู้เล่นช่วยแก้วิกฤต — ${event.message}`,
        commodityId: event.commodityId,
      });
    }
    if (event.type === 'PLAYER_CAUSED_CRISIS') {
      log.push({
        tick: world.tick,
        message: `⚠️ ผู้เล่นทำให้ตลาดวิกฤต — ${event.message}`,
        commodityId: event.commodityId,
      });
    }
  }

  emitPlayerEconomyEvents(events);
  return events;
}

export function getTrackedContract(world: EconomyWorldState) {
  const pe = ensurePlayerEconomy(world);
  if (!pe.trackedContractId) return null;
  return pe.activeContracts.find((c) => c.id === pe.trackedContractId) ?? null;
}

export function trackContract(world: EconomyWorldState, contractId: string | null): void {
  const pe = ensurePlayerEconomy(world);
  pe.trackedContractId = contractId;
}

export function getPlayerTitleAtIsland(
  world: EconomyWorldState,
  islandId: IslandId,
): import('./PlayerEconomyTypes').PlayerEconomicTitle {
  const pe = ensurePlayerEconomy(world);
  return pe.profile.islandReputations[islandId]?.title ?? 'unknown';
}
