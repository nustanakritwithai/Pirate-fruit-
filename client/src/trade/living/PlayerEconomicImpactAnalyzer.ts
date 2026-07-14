import type { CommodityState } from './types';
import { resolveMarketState } from './EconomyRules';
import { PLAYER_REPUTATION_CONFIG } from './PlayerReputationConfig';
import type {
  PlayerEconomicImpact,
  PlayerMarketActivityWindow,
  PlayerTradeEvent,
} from './PlayerEconomyTypes';

const SEVERE_STATES = new Set(['shortage', 'crisis', 'collapsed']);
const CRISIS_STATES = new Set(['crisis', 'collapsed']);

export function classifyMarketImpact(
  event: PlayerTradeEvent,
  window: PlayerMarketActivityWindow,
): PlayerEconomicImpact[] {
  const impacts: PlayerEconomicImpact[] = [];
  const { marketStateBefore, marketStateAfter, type, targetStock, stockBefore } = event;

  if (type === 'sell') {
    if (CRISIS_STATES.has(marketStateBefore) && !CRISIS_STATES.has(marketStateAfter)) {
      impacts.push('resolved-crisis');
    } else if (marketStateBefore === 'shortage' && marketStateAfter === 'balanced') {
      impacts.push('resolved-shortage');
    } else if (SEVERE_STATES.has(marketStateBefore) && marketStateAfter !== marketStateBefore) {
      impacts.push('helped-shortage');
    }

    const sellRatio = window.soldAmount / Math.max(targetStock, 1);
    if (sellRatio >= PLAYER_REPUTATION_CONFIG.marketDumpSellRatio) {
      impacts.push('market-dump');
    }
  }

  if (type === 'buy') {
    if (marketStateBefore === 'balanced' && marketStateAfter === 'shortage') {
      impacts.push('caused-shortage');
    } else if (SEVERE_STATES.has(marketStateBefore) && CRISIS_STATES.has(marketStateAfter)) {
      impacts.push('caused-crisis');
    } else if (marketStateBefore === 'shortage' && CRISIS_STATES.has(marketStateAfter)) {
      impacts.push('caused-crisis');
    }

    const available = Math.max(stockBefore, 1);
    const buyRatio = window.boughtAmount / available;
    const priceJump = event.unitPrice > 0
      && event.totalValue / event.amount > event.unitPrice * 0.9;
    if (buyRatio >= PLAYER_REPUTATION_CONFIG.marketCorneringBuyRatio && priceJump) {
      impacts.push('market-cornering');
    }
  }

  if (impacts.length === 0) impacts.push('neutral-trade');
  return impacts;
}

export function getMarketStateAfterTrade(
  item: CommodityState,
  stockAfter: number,
): import('./types').MarketState {
  const saved = item.stock;
  item.stock = stockAfter;
  const state = resolveMarketState(item);
  item.stock = saved;
  return state;
}

export function updateActivityWindow(
  windows: PlayerMarketActivityWindow[],
  event: PlayerTradeEvent,
  windowTicks: number,
): PlayerMarketActivityWindow {
  let win = windows.find(
    (w) => w.playerId === event.playerId
      && w.islandId === event.islandId
      && w.commodityId === event.commodityId,
  );

  if (!win || event.tick - win.startTick > windowTicks) {
    win = {
      playerId: event.playerId,
      islandId: event.islandId,
      commodityId: event.commodityId,
      boughtAmount: 0,
      soldAmount: 0,
      totalBuyValue: 0,
      totalSellValue: 0,
      startTick: event.tick,
      lastTick: event.tick,
    };
    windows.push(win);
  }

  if (event.type === 'buy') {
    win.boughtAmount += event.amount;
    win.totalBuyValue += event.totalValue;
  } else {
    win.soldAmount += event.amount;
    win.totalSellValue += event.totalValue;
  }
  win.lastTick = event.tick;

  return win;
}

export function pruneActivityWindows(
  windows: PlayerMarketActivityWindow[],
  currentTick: number,
  windowTicks: number,
): void {
  for (let i = windows.length - 1; i >= 0; i -= 1) {
    if (currentTick - windows[i].lastTick > windowTicks * 2) {
      windows.splice(i, 1);
    }
  }
}
