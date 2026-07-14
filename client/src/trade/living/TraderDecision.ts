import type { DynamicTradeOrder, EconomyWorldState, TraderAgentState } from './types';
import { DYNAMIC_TRADE } from './DynamicTradeConfig';
import { findRoute } from './TradeRouteUtils';
import {
  getCongestionLevel,
  getEffectiveTravelTicks,
  getTraderRouteMemory,
  getOrCreateRouteReputation,
  getTraderProfile,
  isRouteAvoided,
  routeReputationKey,
  scoreExplorationBonus,
  scoreFailurePenalty,
  scorePreference,
  scoreRouteMemoryComponent,
  scoreUncertaintyPenalty,
} from './TraderMemoryStore';
import { genomeTradeBonus, genomeRiskModifier } from './GenomeGameplayBias';
import { shouldExplore, traderRandom } from './TraderMemoryRng';

export interface OrderScoreBreakdown {
  order: DynamicTradeOrder;
  finalScore: number;
  amount: number;
  currentOpportunityScore: number;
  routeMemoryScore: number;
  preferenceScore: number;
  explorationBonus: number;
  failurePenalty: number;
  uncertaintyPenalty: number;
  congestionPenalty: number;
}

function currentOpportunityScore(
  order: DynamicTradeOrder,
  trader: TraderAgentState,
  travelTicks: number,
  congestion: number,
): number {
  const riskAversion = 1.5 - trader.riskTolerance;
  return (
    order.profitPerCargoSlot * DYNAMIC_TRADE.profitWeight
    + order.urgency * DYNAMIC_TRADE.urgencyWeight * 10
    - order.riskCost * riskAversion * DYNAMIC_TRADE.riskWeight
    - travelTicks * DYNAMIC_TRADE.travelTimeWeight
    - order.spoilageCost * DYNAMIC_TRADE.spoilageWeight
    - congestion * 6
  );
}

export function scoreOrderForTrader(
  order: DynamicTradeOrder,
  trader: TraderAgentState,
  world: EconomyWorldState,
): number {
  return scoreOrderDetailed(order, trader, world).finalScore;
}

export function scoreOrderDetailed(
  order: DynamicTradeOrder,
  trader: TraderAgentState,
  world: EconomyWorldState,
): OrderScoreBreakdown {
  const amount = Math.min(order.remainingAmount, trader.cargoCapacity);
  const zero: OrderScoreBreakdown = {
    order,
    finalScore: -Infinity,
    amount,
    currentOpportunityScore: 0,
    routeMemoryScore: 0,
    preferenceScore: 0,
    explorationBonus: 0,
    failurePenalty: 0,
    uncertaintyPenalty: 0,
    congestionPenalty: 0,
  };

  if (order.status !== 'open') return zero;
  if (order.remainingAmount <= 0) return zero;
  if (order.expectedProfit < DYNAMIC_TRADE.minimumExpectedProfit) return zero;

  const route = findRoute(world, order.sourceIslandId, order.destinationIslandId);
  if (!route) return zero;

  const profile = getTraderProfile(world, trader.id);
  if (
    isRouteAvoided(
      world,
      trader.id,
      order.sourceIslandId,
      order.destinationIslandId,
      order.commodityId,
      order.urgency,
      order.expectedProfit,
      profile,
    )
  ) {
    return zero;
  }

  const congestion = getCongestionLevel(route);
  const travelTicks = getEffectiveTravelTicks(route);
  const memory = getTraderRouteMemory(
    world,
    trader.id,
    order.sourceIslandId,
    order.destinationIslandId,
    order.commodityId,
  );
  const reputation = world.routeReputations.find(
    (r) => r.routeKey === routeReputationKey(
      order.sourceIslandId,
      order.destinationIslandId,
      order.commodityId,
    ),
  ) ?? getOrCreateRouteReputation(
    world,
    order.sourceIslandId,
    order.destinationIslandId,
    order.commodityId,
  );

  const opp = currentOpportunityScore(order, trader, travelTicks, congestion);
  const mem = scoreRouteMemoryComponent(memory, reputation, profile);
  const pref = scorePreference(profile, order.commodityId);
  const explore = scoreExplorationBonus(memory, profile, order.profitPerCargoSlot);
  const failPen = scoreFailurePenalty(memory, profile);
  const uncPen = scoreUncertaintyPenalty(memory);
  const congPen = congestion * 4;
  const tradeBonus = genomeTradeBonus(world, order.sourceIslandId);
  const riskMod = genomeRiskModifier(world, order.sourceIslandId) * order.riskCost;

  const finalScore = opp + mem * profile.memoryWeight + pref + explore - failPen - uncPen - congPen + tradeBonus - riskMod;

  return {
    order,
    finalScore,
    amount: Math.min(amount, DYNAMIC_TRADE.maxOrderAmountPerTick),
    currentOpportunityScore: opp,
    routeMemoryScore: mem,
    preferenceScore: pref,
    explorationBonus: explore,
    failurePenalty: failPen,
    uncertaintyPenalty: uncPen,
    congestionPenalty: congPen,
  };
}

function scoreAllOrders(
  trader: TraderAgentState,
  orders: DynamicTradeOrder[],
  world: EconomyWorldState,
  maxAmount: number,
): OrderScoreBreakdown[] {
  const scored: OrderScoreBreakdown[] = [];
  for (const order of orders) {
    if (order.status !== 'open') continue;
    const detail = scoreOrderDetailed(order, trader, world);
    detail.amount = Math.min(detail.amount, maxAmount);
    if (detail.amount < 3) continue;
    if (detail.finalScore <= 0) continue;
    scored.push(detail);
  }
  scored.sort((a, b) => b.finalScore - a.finalScore);
  return scored;
}

function pickExplorationOrder(
  trader: TraderAgentState,
  scored: OrderScoreBreakdown[],
  world: EconomyWorldState,
): OrderScoreBreakdown | null {
  if (!scored.length) return null;
  const lowConfidence = scored.filter((s) => {
    const mem = getTraderRouteMemory(
      world,
      trader.id,
      s.order.sourceIslandId,
      s.order.destinationIslandId,
      s.order.commodityId,
    );
    return !mem || mem.tripCount < 2 || mem.confidence < 0.4;
  });
  const pool = lowConfidence.length ? lowConfidence : scored;
  const idx = Math.floor(traderRandom(trader.id, world.tick, 7) * pool.length);
  return pool[Math.min(idx, pool.length - 1)] ?? null;
}

export function pickBestOrderForTrader(
  trader: TraderAgentState,
  orders: DynamicTradeOrder[],
  world: EconomyWorldState,
  maxAmount: number,
): { order: DynamicTradeOrder; score: number; amount: number } | null {
  const profile = getTraderProfile(world, trader.id);
  const scored = scoreAllOrders(trader, orders, world, maxAmount);
  if (!scored.length) return null;

  let pick: OrderScoreBreakdown | null = null;
  if (shouldExplore(profile.explorationRate, trader.id, world.tick)) {
    pick = pickExplorationOrder(trader, scored, world);
  }
  if (!pick) pick = scored[0];

  return {
    order: pick.order,
    score: pick.finalScore,
    amount: pick.amount,
  };
}

export function scoreAllOrdersForTrader(
  trader: TraderAgentState,
  orders: DynamicTradeOrder[],
  world: EconomyWorldState,
  maxAmount: number,
): OrderScoreBreakdown[] {
  return scoreAllOrders(trader, orders, world, maxAmount);
}
