import type { IslandId } from '../../island/IslandTypes';
import type { LivingCommodityId, MarketState } from './types';

export const DEFAULT_PLAYER_ID = 'player';

export type PlayerEconomicTitle =
  | 'unknown'
  | 'local-trader'
  | 'trusted-merchant'
  | 'island-supplier'
  | 'trade-partner'
  | 'market-manipulator'
  | 'profiteer'
  | 'economic-savior';

export interface PlayerIslandEconomicReputation {
  islandId: IslandId;
  trust: number;
  supplierReputation: number;
  marketManipulation: number;
  contractReliability: number;
  crisisContribution: number;
  unitsBought: number;
  unitsSold: number;
  tradeValue: number;
  profitTaken: number;
  shortageReliefAmount: number;
  shortageCausedAmount: number;
  completedContracts: number;
  failedContracts: number;
  lastInteractionTick: number;
  title: PlayerEconomicTitle;
}

export interface PlayerEconomicProfile {
  playerId: string;
  lifetimePurchaseValue: number;
  lifetimeSalesValue: number;
  lifetimeProfit: number;
  lifetimeLoss: number;
  totalUnitsBought: number;
  totalUnitsSold: number;
  completedContracts: number;
  failedContracts: number;
  abandonedContracts: number;
  suppliedShortageValue: number;
  causedShortageValue: number;
  relievedCrisisCount: number;
  causedMarketCrashCount: number;
  largestSingleTradeProfit: number;
  largestSingleTradeLoss: number;
  preferredCommodities: Partial<Record<LivingCommodityId, number>>;
  islandReputations: Record<string, PlayerIslandEconomicReputation>;
  activeContractIds: string[];
  completedContractIds: string[];
  lastTradeTick: number;
}

export interface PlayerTradeEvent {
  playerId: string;
  islandId: IslandId;
  commodityId: LivingCommodityId;
  type: 'buy' | 'sell';
  amount: number;
  unitPrice: number;
  totalValue: number;
  stockBefore: number;
  stockAfter: number;
  targetStock: number;
  marketStateBefore: MarketState;
  marketStateAfter: MarketState;
  tick: number;
}

export type PlayerEconomicImpact =
  | 'neutral-trade'
  | 'helped-shortage'
  | 'resolved-shortage'
  | 'resolved-crisis'
  | 'caused-shortage'
  | 'caused-crisis'
  | 'market-dump'
  | 'market-cornering'
  | 'contract-delivery'
  | 'contract-failure';

export interface PlayerMarketActivityWindow {
  playerId: string;
  islandId: IslandId;
  commodityId: LivingCommodityId;
  boughtAmount: number;
  soldAmount: number;
  totalBuyValue: number;
  totalSellValue: number;
  startTick: number;
  lastTick: number;
}

export type PlayerContractStatus =
  | 'available'
  | 'accepted'
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'expired'
  | 'abandoned';

export interface PlayerTradeContract {
  id: string;
  playerId?: string;
  sourceOrderId: string;
  commodityId: LivingCommodityId;
  sourceIslandId: import('./types').EconomyCellId;
  destinationIslandId: import('./types').EconomyCellId;
  requestedAmount: number;
  deliveredAmount: number;
  baseReward: number;
  urgencyBonus: number;
  riskBonus: number;
  reputationBonus: number;
  completionReward: number;
  collateral: number;
  acceptedTick?: number;
  expiresAtTick: number;
  status: PlayerContractStatus;
  minimumDeliveryRatio: number;
  reservedForPlayer: boolean;
  minimumTrust?: number;
  minimumSupplierReputation?: number;
  minimumContractReliability?: number;
  createdTick: number;
  npcAssignableAfterTick: number;
}

export interface PlayerTradeHistoryEntry {
  tick: number;
  islandId: IslandId;
  commodityId: LivingCommodityId;
  type: 'buy' | 'sell';
  amount: number;
  totalValue: number;
  profit: number;
  impact: PlayerEconomicImpact;
  marketStateBefore: MarketState;
  marketStateAfter: MarketState;
}

export interface EconomicRecord {
  entityId: string;
  entityName: string;
  value: number;
  commodityId?: LivingCommodityId;
  islandId?: IslandId;
  tick: number;
}

export interface EconomyWorldRecords {
  biggestSupplier: EconomicRecord | null;
  largestImporter: EconomicRecord | null;
  highestSingleTradeProfit: EconomicRecord | null;
  mostTrustedMerchant: EconomicRecord | null;
  biggestMarketManipulator: EconomicRecord | null;
  mostRelievedCommodity: EconomicRecord | null;
}

export interface PlayerEconomyState {
  profile: PlayerEconomicProfile;
  activityWindows: PlayerMarketActivityWindow[];
  availableContracts: PlayerTradeContract[];
  activeContracts: PlayerTradeContract[];
  contractHistory: PlayerTradeContract[];
  tradeHistory: PlayerTradeHistoryEntry[];
  worldRecords: EconomyWorldRecords;
  trackedContractId: string | null;
}

export type PlayerEconomyEventType =
  | 'PLAYER_TRADE_RECORDED'
  | 'PLAYER_HELPED_SHORTAGE'
  | 'PLAYER_RESOLVED_SHORTAGE'
  | 'PLAYER_RESOLVED_CRISIS'
  | 'PLAYER_CAUSED_SHORTAGE'
  | 'PLAYER_CAUSED_CRISIS'
  | 'PLAYER_MARKET_DUMP'
  | 'PLAYER_MARKET_CORNERING'
  | 'PLAYER_CONTRACT_AVAILABLE'
  | 'PLAYER_CONTRACT_ACCEPTED'
  | 'PLAYER_CONTRACT_PROGRESS'
  | 'PLAYER_CONTRACT_COMPLETED'
  | 'PLAYER_CONTRACT_FAILED'
  | 'PLAYER_CONTRACT_EXPIRED'
  | 'PLAYER_CONTRACT_ABANDONED'
  | 'PLAYER_REPUTATION_CHANGED'
  | 'PLAYER_ECONOMIC_TITLE_CHANGED';

export interface PlayerEconomyEvent {
  type: PlayerEconomyEventType;
  tick: number;
  message: string;
  islandId?: IslandId;
  commodityId?: LivingCommodityId;
  contractId?: string;
  title?: PlayerEconomicTitle;
  impact?: PlayerEconomicImpact;
}
