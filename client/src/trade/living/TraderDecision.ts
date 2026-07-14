import type { DynamicTradeOrder, EconomyWorldState, TraderAgentState } from './types';
import { DYNAMIC_TRADE } from './DynamicTradeConfig';
import { findRoute } from './TradeRouteUtils';

export function scoreOrderForTrader(
  order: DynamicTradeOrder,
  trader: TraderAgentState,
  world: EconomyWorldState,
): number {
  if (order.status !== 'open') return -Infinity;
  if (order.remainingAmount <= 0) return -Infinity;
  if (order.expectedProfit < DYNAMIC_TRADE.minimumExpectedProfit) return -Infinity;

  const route = findRoute(world, order.sourceIslandId, order.destinationIslandId);
  if (!route) return -Infinity;

  const riskAversion = 1.5 - trader.riskTolerance;
  const travelTicks = route.travelTicks + (route.traffic ?? 0) * 0.1;

  return (
    order.profitPerCargoSlot * DYNAMIC_TRADE.profitWeight
    + order.urgency * DYNAMIC_TRADE.urgencyWeight * 10
    - order.riskCost * riskAversion * DYNAMIC_TRADE.riskWeight
    - travelTicks * DYNAMIC_TRADE.travelTimeWeight
    - order.spoilageCost * DYNAMIC_TRADE.spoilageWeight
  );
}

export function pickBestOrderForTrader(
  trader: TraderAgentState,
  orders: DynamicTradeOrder[],
  world: EconomyWorldState,
  maxAmount: number,
): { order: DynamicTradeOrder; score: number; amount: number } | null {
  let best: { order: DynamicTradeOrder; score: number; amount: number } | null = null;

  for (const order of orders) {
    if (order.status !== 'open') continue;
    const amount = Math.min(order.remainingAmount, trader.cargoCapacity, maxAmount);
    if (amount < 3) continue;

    const score = scoreOrderForTrader(order, trader, world);
    if (score <= 0) continue;
    if (!best || score > best.score) {
      best = { order, score, amount };
    }
  }
  return best;
}
