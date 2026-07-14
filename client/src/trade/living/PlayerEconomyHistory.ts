import type { EconomyWorldState } from './types';
import { PLAYER_REPUTATION_CONFIG } from './PlayerReputationConfig';
import type {
  EconomyWorldRecords,
  PlayerEconomyState,
  PlayerEconomicProfile,
  PlayerTradeHistoryEntry,
} from './PlayerEconomyTypes';
import { createDefaultProfile } from './PlayerReputationManager';

export function createDefaultPlayerEconomy(): PlayerEconomyState {
  return {
    profile: createDefaultProfile(),
    activityWindows: [],
    availableContracts: [],
    activeContracts: [],
    contractHistory: [],
    tradeHistory: [],
    worldRecords: createEmptyRecords(),
    trackedContractId: null,
  };
}

export function createEmptyRecords(): EconomyWorldRecords {
  return {
    biggestSupplier: null,
    largestImporter: null,
    highestSingleTradeProfit: null,
    mostTrustedMerchant: null,
    biggestMarketManipulator: null,
    mostRelievedCommodity: null,
  };
}

export function updateWorldRecords(
  pe: PlayerEconomyState,
  profile: PlayerEconomicProfile,
  entry: PlayerTradeHistoryEntry,
): void {
  const records = pe.worldRecords;
  const name = 'ผู้เล่น';

  if (entry.type === 'sell' && entry.totalValue > (records.biggestSupplier?.value ?? 0)) {
    records.biggestSupplier = {
      entityId: profile.playerId,
      entityName: name,
      value: entry.totalValue,
      commodityId: entry.commodityId,
      islandId: entry.islandId,
      tick: entry.tick,
    };
  }

  if (entry.type === 'buy' && entry.totalValue > (records.largestImporter?.value ?? 0)) {
    records.largestImporter = {
      entityId: profile.playerId,
      entityName: name,
      value: entry.totalValue,
      commodityId: entry.commodityId,
      islandId: entry.islandId,
      tick: entry.tick,
    };
  }

  if (entry.profit > (records.highestSingleTradeProfit?.value ?? 0)) {
    records.highestSingleTradeProfit = {
      entityId: profile.playerId,
      entityName: name,
      value: entry.profit,
      commodityId: entry.commodityId,
      islandId: entry.islandId,
      tick: entry.tick,
    };
  }

  for (const rep of Object.values(profile.islandReputations)) {
    if (rep.trust > (records.mostTrustedMerchant?.value ?? 0)) {
      records.mostTrustedMerchant = {
        entityId: profile.playerId,
        entityName: name,
        value: rep.trust,
        islandId: rep.islandId,
        tick: entry.tick,
      };
    }
    if (rep.marketManipulation > (records.biggestMarketManipulator?.value ?? 0)) {
      records.biggestMarketManipulator = {
        entityId: profile.playerId,
        entityName: name,
        value: rep.marketManipulation,
        islandId: rep.islandId,
        tick: entry.tick,
      };
    }
    if (rep.shortageReliefAmount > (records.mostRelievedCommodity?.value ?? 0)) {
      records.mostRelievedCommodity = {
        entityId: profile.playerId,
        entityName: name,
        value: rep.shortageReliefAmount,
        commodityId: entry.commodityId,
        islandId: rep.islandId,
        tick: entry.tick,
      };
    }
  }
}

export function getPlayerEconomySummary(world: EconomyWorldState): {
  lifetimeProfit: number;
  contractSuccessRate: number;
  crisesRelieved: number;
  crisesCaused: number;
  topIsland: string | null;
  topCommodity: string | null;
} {
  const pe = world.playerEconomy;
  if (!pe) {
    return {
      lifetimeProfit: 0,
      contractSuccessRate: 0,
      crisesRelieved: 0,
      crisesCaused: 0,
      topIsland: null,
      topCommodity: null,
    };
  }
  const p = pe.profile;
  const total = p.completedContracts + p.failedContracts;
  let topIsland: string | null = null;
  let topTrust = -1;
  for (const rep of Object.values(p.islandReputations)) {
    if (rep.trust > topTrust) {
      topTrust = rep.trust;
      topIsland = rep.islandId;
    }
  }
  let topCommodity: string | null = null;
  let topVol = 0;
  for (const [id, vol] of Object.entries(p.preferredCommodities)) {
    if ((vol ?? 0) > topVol) {
      topVol = vol ?? 0;
      topCommodity = id;
    }
  }
  return {
    lifetimeProfit: p.lifetimeProfit,
    contractSuccessRate: total > 0 ? p.completedContracts / total : 0,
    crisesRelieved: p.relievedCrisisCount,
    crisesCaused: p.causedMarketCrashCount,
    topIsland,
    topCommodity,
  };
}

export function trimContractHistory(pe: PlayerEconomyState): void {
  if (pe.contractHistory.length > PLAYER_REPUTATION_CONFIG.maxSavedContractsHistory) {
    pe.contractHistory = pe.contractHistory.slice(0, PLAYER_REPUTATION_CONFIG.maxSavedContractsHistory);
  }
}
