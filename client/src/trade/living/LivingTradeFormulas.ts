import { ECONOMY_CONFIG } from './LivingTradeConfig';
import { effectiveTargetStock } from './GenomeGameplayBias';
import type { CommodityState, EconomyCellId, EconomyWorldState } from './types';

export function stockRatio(
  item: CommodityState,
  world?: EconomyWorldState,
  cellId?: EconomyCellId,
): number {
  const target = world && cellId
    ? effectiveTargetStock(world, cellId, item.targetStock)
    : item.targetStock;
  return item.stock / Math.max(target, 1);
}

/** สูตรราคา Economic CA */
export function calculatePrice(item: CommodityState): number {
  const scarcity = item.targetStock / Math.max(item.stock, 1);
  const demandFactor = 0.7 + item.demand / 100;
  const memoryDrag =
    item.memory.recentSellVolume > item.memory.recentBuyVolume
      ? 0.95
      : item.memory.recentBuyVolume > item.memory.recentSellVolume
        ? 1.05
        : 1;
  const raw = item.basePrice * scarcity * demandFactor * memoryDrag;
  return Math.round(
    Math.max(
      item.basePrice * ECONOMY_CONFIG.minPriceRatio,
      Math.min(item.basePrice * ECONOMY_CONFIG.maxPriceRatio, raw),
    ),
  );
}

/** @deprecated use calculatePrice */
export function calculateMarketPrice(item: CommodityState): number {
  return calculatePrice(item);
}

export function livingBuyPrice(item: CommodityState, impact = 0): number {
  return Math.round(item.currentPrice * ECONOMY_CONFIG.buySpread * (1 + impact));
}

export function livingSellPrice(item: CommodityState, saturation = 0): number {
  return Math.round(item.currentPrice * ECONOMY_CONFIG.sellSpread * (1 - saturation));
}

export function marketImpact(amount: number): number {
  return Math.min(
    ECONOMY_CONFIG.maxMarketImpact,
    amount / ECONOMY_CONFIG.marketLiquidity,
  );
}

export function marketSaturation(amount: number, stock: number): number {
  const ratio = amount / Math.max(stock + amount, 1);
  return Math.min(0.4, ratio * 0.5);
}

export function priceTrend(item: CommodityState): 'up' | 'down' | 'flat' {
  if (item.trend === 'rising') return 'up';
  if (item.trend === 'falling') return 'down';
  return 'flat';
}
