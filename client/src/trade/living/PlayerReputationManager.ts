import type { IslandId } from '../../island/IslandTypes';
import { PLAYER_REPUTATION_CONFIG } from './PlayerReputationConfig';
import type {
  PlayerEconomicImpact,
  PlayerEconomicProfile,
  PlayerEconomicTitle,
  PlayerIslandEconomicReputation,
} from './PlayerEconomyTypes';
import { DEFAULT_PLAYER_ID } from './PlayerEconomyTypes';

export function clampRep(value: number): number {
  return Math.max(
    PLAYER_REPUTATION_CONFIG.trustMin,
    Math.min(PLAYER_REPUTATION_CONFIG.trustMax, value),
  );
}

export function createDefaultProfile(playerId = DEFAULT_PLAYER_ID): PlayerEconomicProfile {
  return {
    playerId,
    lifetimePurchaseValue: 0,
    lifetimeSalesValue: 0,
    lifetimeProfit: 0,
    lifetimeLoss: 0,
    totalUnitsBought: 0,
    totalUnitsSold: 0,
    completedContracts: 0,
    failedContracts: 0,
    abandonedContracts: 0,
    suppliedShortageValue: 0,
    causedShortageValue: 0,
    relievedCrisisCount: 0,
    causedMarketCrashCount: 0,
    largestSingleTradeProfit: 0,
    largestSingleTradeLoss: 0,
    preferredCommodities: {},
    islandReputations: {},
    activeContractIds: [],
    completedContractIds: [],
    lastTradeTick: 0,
  };
}

export function getOrCreateIslandReputation(
  profile: PlayerEconomicProfile,
  islandId: IslandId,
): PlayerIslandEconomicReputation {
  if (!profile.islandReputations[islandId]) {
    profile.islandReputations[islandId] = {
      islandId,
      trust: 10,
      supplierReputation: 0,
      marketManipulation: 0,
      contractReliability: 50,
      crisisContribution: 0,
      unitsBought: 0,
      unitsSold: 0,
      tradeValue: 0,
      profitTaken: 0,
      shortageReliefAmount: 0,
      shortageCausedAmount: 0,
      completedContracts: 0,
      failedContracts: 0,
      lastInteractionTick: 0,
      title: 'unknown',
    };
  }
  return profile.islandReputations[islandId];
}

export function resolveEconomicTitle(
  rep: PlayerIslandEconomicReputation,
  profile: PlayerEconomicProfile,
): PlayerEconomicTitle {
  const cfg = PLAYER_REPUTATION_CONFIG;

  if (
    profile.relievedCrisisCount >= cfg.economicSaviorCrisisCount
    && rep.trust >= 70
  ) {
    return 'economic-savior';
  }
  if (
    rep.marketManipulation >= cfg.profiteerThreshold
    && rep.profitTaken >= 500
  ) {
    return 'profiteer';
  }
  if (rep.marketManipulation >= cfg.marketManipulatorThreshold) {
    return 'market-manipulator';
  }
  if (
    rep.trust >= cfg.tradePartnerThreshold
    && rep.contractReliability >= 70
  ) {
    return 'trade-partner';
  }
  if (rep.supplierReputation >= cfg.islandSupplierThreshold) {
    return 'island-supplier';
  }
  if (
    rep.trust >= cfg.trustedMerchantThreshold
    && rep.marketManipulation < 30
  ) {
    return 'trusted-merchant';
  }
  if (rep.tradeValue > 50 || rep.unitsBought + rep.unitsSold > 5) {
    return 'local-trader';
  }
  return 'unknown';
}

export function applyImpactToReputation(
  rep: PlayerIslandEconomicReputation,
  profile: PlayerEconomicProfile,
  impact: PlayerEconomicImpact,
  tradeValue: number,
): void {
  const cfg = PLAYER_REPUTATION_CONFIG;

  switch (impact) {
    case 'neutral-trade':
      rep.trust = clampRep(rep.trust + cfg.neutralTradeTrustGain);
      break;
    case 'helped-shortage':
      rep.supplierReputation = clampRep(rep.supplierReputation + cfg.helpedShortageSupplierGain);
      rep.shortageReliefAmount += tradeValue;
      profile.suppliedShortageValue += tradeValue;
      break;
    case 'resolved-shortage':
      rep.supplierReputation = clampRep(rep.supplierReputation + cfg.resolvedShortageSupplierGain);
      rep.trust = clampRep(rep.trust + cfg.resolvedShortageSupplierGain * 0.5);
      rep.shortageReliefAmount += tradeValue;
      profile.suppliedShortageValue += tradeValue;
      break;
    case 'resolved-crisis':
      rep.supplierReputation = clampRep(rep.supplierReputation + cfg.resolvedCrisisSupplierGain);
      rep.trust = clampRep(rep.trust + cfg.resolvedCrisisSupplierGain * 0.5);
      rep.crisisContribution = clampRep(rep.crisisContribution + cfg.resolvedCrisisSupplierGain);
      rep.shortageReliefAmount += tradeValue;
      profile.suppliedShortageValue += tradeValue;
      profile.relievedCrisisCount += 1;
      break;
    case 'caused-shortage':
      rep.marketManipulation = clampRep(rep.marketManipulation + cfg.causedShortageManipulationGain);
      rep.shortageCausedAmount += tradeValue;
      profile.causedShortageValue += tradeValue;
      break;
    case 'caused-crisis':
      rep.marketManipulation = clampRep(rep.marketManipulation + cfg.causedCrisisManipulationGain);
      rep.shortageCausedAmount += tradeValue;
      profile.causedShortageValue += tradeValue;
      profile.causedMarketCrashCount += 1;
      break;
    case 'market-dump':
      rep.marketManipulation = clampRep(rep.marketManipulation + cfg.marketDumpManipulationGain);
      break;
    case 'market-cornering':
      rep.marketManipulation = clampRep(rep.marketManipulation + cfg.marketCorneringManipulationGain);
      break;
    default:
      break;
  }
}

export function tickReputationDecay(
  profile: PlayerEconomicProfile,
  ticks: number,
): void {
  const decay = (PLAYER_REPUTATION_CONFIG.reputationDecayPer100Ticks / 100) * ticks;
  for (const rep of Object.values(profile.islandReputations)) {
    if (rep.marketManipulation > 0) {
      rep.marketManipulation = clampRep(rep.marketManipulation - decay);
    }
    if (rep.trust > 10 && rep.lastInteractionTick < profile.lastTradeTick - 50) {
      rep.trust = clampRep(rep.trust - decay * 0.5);
    }
    rep.title = resolveEconomicTitle(rep, profile);
  }
}

export function getFeeModifier(title: PlayerEconomicTitle): number {
  const cfg = PLAYER_REPUTATION_CONFIG;
  let fee: number;
  switch (title) {
    case 'trusted-merchant':
      fee = cfg.feeTrustedMerchant;
      break;
    case 'island-supplier':
      fee = cfg.feeIslandSupplier;
      break;
    case 'trade-partner':
    case 'economic-savior':
      fee = cfg.feeTradePartner;
      break;
    case 'market-manipulator':
      fee = cfg.feeMarketManipulator;
      break;
    case 'profiteer':
      fee = cfg.feeProfiteer;
      break;
    default:
      fee = cfg.feeNormal;
  }
  return Math.max(cfg.feeMin, Math.min(cfg.feeMax, fee));
}

export function getDominantTitle(profile: PlayerEconomicProfile): PlayerEconomicTitle {
  let best: PlayerEconomicTitle = 'unknown';
  let bestScore = -1;
  for (const rep of Object.values(profile.islandReputations)) {
    const score = rep.trust + rep.supplierReputation + rep.tradeValue * 0.01;
    if (score > bestScore) {
      bestScore = score;
      best = rep.title;
    }
  }
  return best;
}

export function getIslandFeeModifier(
  profile: PlayerEconomicProfile,
  islandId: IslandId,
): number {
  const rep = profile.islandReputations[islandId];
  if (!rep) return PLAYER_REPUTATION_CONFIG.feeNormal;
  return getFeeModifier(rep.title);
}
