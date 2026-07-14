import type { IslandId } from '../../island/IslandTypes';
import type { CommodityState, EconomyWorldState, LivingCommodityId, MarketState } from './types';
import { PLAYER_REPUTATION_CONFIG } from './PlayerReputationConfig';
import {
  classifyMarketImpact,
  getMarketStateAfterTrade,
  pruneActivityWindows,
  updateActivityWindow,
} from './PlayerEconomicImpactAnalyzer';
import {
  applyImpactToReputation,
  getOrCreateIslandReputation,
  resolveEconomicTitle,
} from './PlayerReputationManager';
import type {
  PlayerEconomyEvent,
  PlayerEconomyState,
  PlayerTradeEvent,
  PlayerTradeHistoryEntry,
} from './PlayerEconomyTypes';
import { DEFAULT_PLAYER_ID } from './PlayerEconomyTypes';
import { updateWorldRecords } from './PlayerEconomyHistory';
import { onPlayerSellForContracts } from './PlayerContractManager';
import { createDefaultPlayerEconomy } from './PlayerEconomyHistory';

export function ensurePlayerEconomy(world: EconomyWorldState): PlayerEconomyState {
  if (!world.playerEconomy) {
    world.playerEconomy = createDefaultPlayerEconomy();
  }
  return world.playerEconomy;
}

export function recordPlayerTrade(
  world: EconomyWorldState,
  params: {
    playerId?: string;
    islandId: IslandId;
    commodityId: LivingCommodityId;
    type: 'buy' | 'sell';
    amount: number;
    unitPrice: number;
    stockBefore: number;
    targetStock: number;
    marketStateBefore: MarketState;
    item: CommodityState;
  },
  wallet?: import('./PlayerContractManager').ContractWallet,
): PlayerEconomyEvent[] {
  const playerId = params.playerId ?? DEFAULT_PLAYER_ID;
  const pe = ensurePlayerEconomy(world);
  const profile = pe.profile;
  const stockAfter = params.type === 'buy'
    ? Math.max(0, params.stockBefore - params.amount)
    : params.stockBefore + params.amount;
  const marketStateAfter = getMarketStateAfterTrade(params.item, stockAfter);
  const totalValue = params.unitPrice * params.amount;

  const event: PlayerTradeEvent = {
    playerId,
    islandId: params.islandId,
    commodityId: params.commodityId,
    type: params.type,
    amount: params.amount,
    unitPrice: params.unitPrice,
    totalValue,
    stockBefore: params.stockBefore,
    stockAfter,
    targetStock: params.targetStock,
    marketStateBefore: params.marketStateBefore,
    marketStateAfter,
    tick: world.tick,
  };

  const window = updateActivityWindow(
    pe.activityWindows,
    event,
    PLAYER_REPUTATION_CONFIG.activityWindowTicks,
  );
  const impacts = classifyMarketImpact(event, window);
  const rep = getOrCreateIslandReputation(profile, params.islandId);
  const prevTitle = rep.title;

  if (params.type === 'buy') {
    profile.lifetimePurchaseValue += totalValue;
    profile.totalUnitsBought += params.amount;
    rep.unitsBought += params.amount;
  } else {
    profile.lifetimeSalesValue += totalValue;
    profile.totalUnitsSold += params.amount;
    rep.unitsSold += params.amount;
  }
  rep.tradeValue += totalValue;
  rep.lastInteractionTick = world.tick;
  profile.lastTradeTick = world.tick;
  profile.preferredCommodities[params.commodityId]
    = (profile.preferredCommodities[params.commodityId] ?? 0) + params.amount;

  const events: PlayerEconomyEvent[] = [];

  for (const impact of impacts) {
    applyImpactToReputation(rep, profile, impact, totalValue);
    events.push({
      type: impactToEventType(impact),
      tick: world.tick,
      message: impactMessage(impact, params.commodityId),
      islandId: params.islandId,
      commodityId: params.commodityId,
      impact,
    });
  }

  rep.title = resolveEconomicTitle(rep, profile);
  if (rep.title !== prevTitle) {
    events.push({
      type: 'PLAYER_ECONOMIC_TITLE_CHANGED',
      tick: world.tick,
      message: `ได้รับฉายา: ${titleLabel(rep.title)}`,
      islandId: params.islandId,
      title: rep.title,
    });
  }

  const historyEntry: PlayerTradeHistoryEntry = {
    tick: world.tick,
    islandId: params.islandId,
    commodityId: params.commodityId,
    type: params.type,
    amount: params.amount,
    totalValue,
    profit: params.type === 'sell' ? totalValue : -totalValue,
    impact: impacts[0] ?? 'neutral-trade',
    marketStateBefore: params.marketStateBefore,
    marketStateAfter,
  };
  pe.tradeHistory.unshift(historyEntry);
  pe.tradeHistory = pe.tradeHistory.slice(0, PLAYER_REPUTATION_CONFIG.maxSavedPlayerTradeHistory);

  updateWorldRecords(pe, profile, historyEntry);

  if (params.type === 'sell') {
    const contractEvents = onPlayerSellForContracts(
      world,
      params.islandId,
      params.commodityId,
      params.amount,
      playerId,
      wallet,
    );
    events.push(...contractEvents);
  }

  events.unshift({
    type: 'PLAYER_TRADE_RECORDED',
    tick: world.tick,
    message: `${params.type === 'buy' ? 'ซื้อ' : 'ขาย'} ${params.commodityId} x${params.amount}`,
    islandId: params.islandId,
    commodityId: params.commodityId,
  });

  pruneActivityWindows(
    pe.activityWindows,
    world.tick,
    PLAYER_REPUTATION_CONFIG.activityWindowTicks,
  );

  return events;
}

function impactToEventType(impact: import('./PlayerEconomyTypes').PlayerEconomicImpact): import('./PlayerEconomyTypes').PlayerEconomyEventType {
  const map: Record<string, import('./PlayerEconomyTypes').PlayerEconomyEventType> = {
    'helped-shortage': 'PLAYER_HELPED_SHORTAGE',
    'resolved-shortage': 'PLAYER_RESOLVED_SHORTAGE',
    'resolved-crisis': 'PLAYER_RESOLVED_CRISIS',
    'caused-shortage': 'PLAYER_CAUSED_SHORTAGE',
    'caused-crisis': 'PLAYER_CAUSED_CRISIS',
    'market-dump': 'PLAYER_MARKET_DUMP',
    'market-cornering': 'PLAYER_MARKET_CORNERING',
  };
  return map[impact] ?? 'PLAYER_TRADE_RECORDED';
}

function impactMessage(impact: string, commodityId: LivingCommodityId): string {
  const labels: Record<string, string> = {
    'resolved-crisis': `ช่วยแก้วิกฤต ${commodityId}`,
    'resolved-shortage': `แก้ shortage ${commodityId}`,
    'helped-shortage': `ช่วยตลาดขาด ${commodityId}`,
    'caused-shortage': `ทำให้ตลาดขาด ${commodityId}`,
    'caused-crisis': `ทำให้ตลาดวิกฤต ${commodityId}`,
    'market-dump': `ทิ้งสินค้าจำนวนมาก`,
    'market-cornering': `กว้านซื้อตลาด`,
  };
  return labels[impact] ?? impact;
}

function titleLabel(title: string): string {
  const labels: Record<string, string> = {
    'unknown': 'ไม่ทราบ',
    'local-trader': 'พ่อค้าท้องถิ่น',
    'trusted-merchant': 'พ่อค้าที่ไว้ใจได้',
    'island-supplier': 'ผู้จัดหาเกาะ',
    'trade-partner': 'คู่ค้าเชิงลึก',
    'market-manipulator': 'ผู้บิดเบือนตลาด',
    'profiteer': 'นักเก็งกำไร',
    'economic-savior': 'ผู้ช่วยเศรษฐกิจ',
  };
  return labels[title] ?? title;
}

export { titleLabel };
