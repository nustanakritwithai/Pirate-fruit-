import { LIVING_TRADE_CONFIG } from './LivingTradeConfig';
import type { CommodityState } from './types';

/** ราคาตลาดจาก scarcity + demand */
export function calculateMarketPrice(item: CommodityState): number {
  const scarcityRatio = (item.targetStock / Math.max(item.stock, 1)) * item.demandMultiplier;
  const raw = item.basePrice * scarcityRatio;
  return Math.round(
    Math.max(
      item.basePrice * LIVING_TRADE_CONFIG.minPriceRatio,
      Math.min(item.basePrice * LIVING_TRADE_CONFIG.maxPriceRatio, raw),
    ),
  );
}

/** ราคาซื้อจากร้าน (สูงกว่าราคากลาง — spread) */
export function livingBuyPrice(item: CommodityState, marketImpact = 0): number {
  const base = item.currentPrice * LIVING_TRADE_CONFIG.buySpread;
  return Math.round(base * (1 + marketImpact));
}

/** ราคาขายให้ร้าน (ต่ำกว่าราคากลาง — spread + saturation) */
export function livingSellPrice(item: CommodityState, saturation = 0): number {
  const base = item.currentPrice * LIVING_TRADE_CONFIG.sellSpread;
  return Math.round(base * (1 - saturation));
}

/** ผลกระทบราคาเมื่อซื้อ/ขายปริมาณมาก */
export function marketImpact(amount: number): number {
  const impact = amount / LIVING_TRADE_CONFIG.marketLiquidity;
  return Math.min(LIVING_TRADE_CONFIG.maxMarketImpact, impact);
}

/** ความอิ่มตัวตลาดเมื่อขายปริมาณมาก */
export function marketSaturation(amount: number, stock: number): number {
  const ratio = amount / Math.max(stock + amount, 1);
  return Math.min(0.4, ratio * 0.5);
}

/** แนวโน้มราคา */
export function priceTrend(item: CommodityState): 'up' | 'down' | 'flat' {
  const diff = item.currentPrice - item.previousPrice;
  if (diff > 1) return 'up';
  if (diff < -1) return 'down';
  return 'flat';
}
