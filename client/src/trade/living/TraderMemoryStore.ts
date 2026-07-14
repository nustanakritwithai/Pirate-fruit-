import type {
  AvoidRouteReason,
  DynamicTradeOrder,
  EconomyCellId,
  EconomyWorldState,
  LivingCommodityId,
  RouteReputation,
  TraderProfile,
  TraderRouteMemory,
  TradeRouteState,
} from './types';
import { TRADER_MEMORY, type TraderPersonality } from './TraderMemoryConfig';
import { DYNAMIC_TRADE } from './DynamicTradeConfig';

export function traderMemoryKey(
  traderId: string,
  sourceId: EconomyCellId,
  destId: EconomyCellId,
  commodityId: LivingCommodityId,
): string {
  return `${traderId}:${sourceId}:${destId}:${commodityId}`;
}

export function routeReputationKey(
  sourceId: EconomyCellId,
  destId: EconomyCellId,
  commodityId: LivingCommodityId,
): string {
  return `${sourceId}:${destId}:${commodityId}`;
}

export function routeAvoidKey(
  sourceId: EconomyCellId,
  destId: EconomyCellId,
  commodityId: LivingCommodityId,
): string {
  return `${sourceId}:${destId}:${commodityId}`;
}

const PERSONALITY_BY_TRADER: Record<string, TraderPersonality> = {
  'trader-leaf-safe': 'conservative',
  'trader-mine-bal': 'balanced',
  'trader-cloth-bold': 'aggressive',
  'trader-yard': 'balanced',
  'trader-roamer': 'opportunist',
};

export function personalityForTrader(traderId: string): TraderPersonality {
  return PERSONALITY_BY_TRADER[traderId] ?? 'balanced';
}

export function createProfileForTrader(
  traderId: string,
  riskTolerance?: number,
): TraderProfile {
  const personality = personalityForTrader(traderId);
  const preset = TRADER_MEMORY.personalityPresets[personality];
  return {
    traderId,
    personality,
    riskTolerance: riskTolerance ?? preset.riskTolerance,
    explorationRate: preset.explorationRate,
    memoryWeight: preset.memoryWeight,
    recencyBias: preset.recencyBias,
    lossAversion: preset.lossAversion,
    preferredCommodities: [],
    avoidedRoutes: [],
    lifetimeProfit: 0,
    completedTrips: 0,
    failedTrips: 0,
    commodityAffinity: {},
  };
}

export function ensureTraderMemoryState(world: EconomyWorldState): void {
  world.traderProfiles ??= [];
  world.traderRouteMemories ??= [];
  world.avoidedRoutes ??= [];
  world.routeReputations ??= [];
  world.traderRngSeed ??= 42_424;

  for (const trader of world.traders) {
    if (!world.traderProfiles.find((p) => p.traderId === trader.id)) {
      world.traderProfiles.push(createProfileForTrader(trader.id, trader.riskTolerance));
    }
  }
  ensureRouteReputations(world);
}

export function getTraderProfile(world: EconomyWorldState, traderId: string): TraderProfile {
  ensureTraderMemoryState(world);
  let profile = world.traderProfiles.find((p) => p.traderId === traderId);
  if (!profile) {
    profile = createProfileForTrader(traderId);
    world.traderProfiles.push(profile);
  }
  return profile;
}

function emptyMemory(
  traderId: string,
  sourceId: EconomyCellId,
  destId: EconomyCellId,
  commodityId: LivingCommodityId,
  tick: number,
): TraderRouteMemory {
  return {
    key: traderMemoryKey(traderId, sourceId, destId, commodityId),
    traderId,
    sourceIslandId: sourceId,
    destinationIslandId: destId,
    commodityId,
    tripCount: 0,
    successfulTrips: 0,
    failedTrips: 0,
    raidCount: 0,
    spoilageLoss: 0,
    totalRevenue: 0,
    totalCost: 0,
    totalProfit: 0,
    averageProfit: 0,
    averageProfitPerSlot: 0,
    averageTravelTicks: 0,
    averageRiskCost: 0,
    profitEma: 0,
    successRateEma: 0.5,
    dangerEma: DYNAMIC_TRADE.baseRouteDanger,
    delayEma: 0,
    spoilageEma: 0,
    confidence: 0,
    lastUsedTick: tick,
    lastSuccessTick: 0,
    lastFailureTick: 0,
    consecutiveSuccesses: 0,
    consecutiveFailures: 0,
  };
}

export function getTraderRouteMemory(
  world: EconomyWorldState,
  traderId: string,
  sourceId: EconomyCellId,
  destId: EconomyCellId,
  commodityId: LivingCommodityId,
): TraderRouteMemory | undefined {
  const key = traderMemoryKey(traderId, sourceId, destId, commodityId);
  return world.traderRouteMemories.find((m) => m.key === key);
}

export function getOrCreateTraderRouteMemory(
  world: EconomyWorldState,
  traderId: string,
  sourceId: EconomyCellId,
  destId: EconomyCellId,
  commodityId: LivingCommodityId,
): TraderRouteMemory {
  ensureTraderMemoryState(world);
  const key = traderMemoryKey(traderId, sourceId, destId, commodityId);
  let memory = world.traderRouteMemories.find((m) => m.key === key);
  if (!memory) {
    memory = emptyMemory(traderId, sourceId, destId, commodityId, world.tick);
    world.traderRouteMemories.push(memory);
  }
  return memory;
}

function ema(prev: number, value: number, alpha: number): number {
  return prev * (1 - alpha) + value * alpha;
}

function clampConfidence(v: number): number {
  return Math.max(
    TRADER_MEMORY.minimumConfidence,
    Math.min(TRADER_MEMORY.maximumConfidence, v),
  );
}

function clampAffinity(v: number): number {
  return Math.max(TRADER_MEMORY.affinityMin, Math.min(TRADER_MEMORY.affinityMax, v));
}

export function getCommodityAffinity(profile: TraderProfile, commodityId: LivingCommodityId): number {
  return clampAffinity(profile.commodityAffinity[commodityId] ?? 1);
}

export function adjustCommodityAffinity(
  profile: TraderProfile,
  commodityId: LivingCommodityId,
  profitable: boolean,
): void {
  const current = profile.commodityAffinity[commodityId] ?? 1;
  profile.commodityAffinity[commodityId] = clampAffinity(
    current + (profitable ? TRADER_MEMORY.affinityGain : -TRADER_MEMORY.affinityLoss),
  );
  if ((profile.commodityAffinity[commodityId] ?? 1) > 1.05) {
    if (!profile.preferredCommodities.includes(commodityId)) {
      profile.preferredCommodities.push(commodityId);
    }
  }
}

export function avoidThresholdForProfile(profile: TraderProfile): number {
  const preset = TRADER_MEMORY.personalityPresets[profile.personality];
  return preset.avoidFailureThreshold;
}

export function isRouteAvoided(
  world: EconomyWorldState,
  traderId: string,
  sourceId: EconomyCellId,
  destId: EconomyCellId,
  commodityId: LivingCommodityId,
  orderUrgency = 0,
  expectedProfit = 0,
  profile?: TraderProfile,
): boolean {
  const prof = profile ?? getTraderProfile(world, traderId);
  const key = routeAvoidKey(sourceId, destId, commodityId);
  const avoided = world.avoidedRoutes.find(
    (a) => a.traderId === traderId && a.routeKey === key && a.avoidUntilTick > world.tick,
  );
  if (!avoided) return false;

  if (prof.personality === 'aggressive' && orderUrgency >= TRADER_MEMORY.emergencyUrgencyOverride) {
    return false;
  }
  if (
    prof.personality === 'opportunist'
    && expectedProfit >= TRADER_MEMORY.opportunistProfitOverride
  ) {
    return false;
  }
  return true;
}

export function addAvoidedRoute(
  world: EconomyWorldState,
  traderId: string,
  sourceId: EconomyCellId,
  destId: EconomyCellId,
  commodityId: LivingCommodityId,
  reason: AvoidRouteReason,
  ticks: number = TRADER_MEMORY.routeAvoidTicks,
): void {
  const key = routeAvoidKey(sourceId, destId, commodityId);
  const existing = world.avoidedRoutes.find(
    (a) => a.traderId === traderId && a.routeKey === key,
  );
  if (existing) {
    existing.avoidUntilTick = world.tick + ticks;
    existing.reason = reason;
    return;
  }
  world.avoidedRoutes.push({
    traderId,
    routeKey: key,
    avoidUntilTick: world.tick + ticks,
    reason,
  });
  const profile = getTraderProfile(world, traderId);
  if (!profile.avoidedRoutes.includes(key)) {
    profile.avoidedRoutes.push(key);
  }
}

export function pruneAvoidedRoutes(world: EconomyWorldState): void {
  world.avoidedRoutes = world.avoidedRoutes.filter((a) => a.avoidUntilTick > world.tick);
}

export interface ShipmentMemoryInput {
  traderId: string;
  order: DynamicTradeOrder;
  success: boolean;
  actualProfit: number;
  revenue: number;
  cost: number;
  travelTicks: number;
  plannedTravelTicks: number;
  spoilageLoss: number;
  wasRaid: boolean;
  deliveredAmount: number;
}

export function recordShipmentMemory(world: EconomyWorldState, input: ShipmentMemoryInput): void {
  ensureTraderMemoryState(world);
  const {
    traderId, order, success, actualProfit, revenue, cost,
    travelTicks, plannedTravelTicks, spoilageLoss, wasRaid, deliveredAmount,
  } = input;
  const profile = getTraderProfile(world, traderId);
  const memory = getOrCreateTraderRouteMemory(
    world,
    traderId,
    order.sourceIslandId,
    order.destinationIslandId,
    order.commodityId,
  );

  memory.tripCount += 1;
  memory.lastUsedTick = world.tick;
  memory.totalRevenue += revenue;
  memory.totalCost += cost;
  memory.totalProfit += actualProfit;
  memory.averageProfit = memory.totalProfit / memory.tripCount;
  memory.averageProfitPerSlot = deliveredAmount > 0
    ? memory.totalProfit / Math.max(memory.tripCount * deliveredAmount / memory.tripCount, 1)
    : memory.averageProfit;
  memory.averageTravelTicks = ema(memory.averageTravelTicks || travelTicks, travelTicks, 0.3);
  memory.averageRiskCost = ema(memory.averageRiskCost, order.riskCost, 0.3);

  const delay = Math.max(0, travelTicks - plannedTravelTicks);
  memory.delayEma = ema(memory.delayEma, delay, TRADER_MEMORY.delayEmaAlpha);

  if (spoilageLoss > 0) {
    memory.spoilageLoss += spoilageLoss;
    memory.spoilageEma = ema(
      memory.spoilageEma,
      spoilageLoss / Math.max(deliveredAmount + spoilageLoss, 1),
      TRADER_MEMORY.spoilageEmaAlpha,
    );
  }

  if (success) {
    memory.successfulTrips += 1;
    memory.consecutiveSuccesses += 1;
    memory.consecutiveFailures = 0;
    memory.lastSuccessTick = world.tick;
    memory.profitEma = ema(memory.profitEma, actualProfit, TRADER_MEMORY.profitEmaAlpha);
    memory.successRateEma = ema(memory.successRateEma, 1, TRADER_MEMORY.successEmaAlpha);
    memory.confidence = clampConfidence(
      memory.confidence + TRADER_MEMORY.confidenceGainSuccess,
    );
    profile.completedTrips += 1;
    profile.lifetimeProfit += actualProfit;
    adjustCommodityAffinity(profile, order.commodityId, actualProfit > 0);
  } else {
    memory.failedTrips += 1;
    memory.consecutiveFailures += 1;
    memory.consecutiveSuccesses = 0;
    memory.lastFailureTick = world.tick;
    memory.profitEma = ema(memory.profitEma, actualProfit, TRADER_MEMORY.profitEmaAlpha);
    memory.successRateEma = ema(memory.successRateEma, 0, TRADER_MEMORY.successEmaAlpha);
    memory.confidence = clampConfidence(
      memory.confidence + TRADER_MEMORY.confidenceGainFailure,
    );
    profile.failedTrips += 1;
    adjustCommodityAffinity(profile, order.commodityId, false);

    if (wasRaid) {
      memory.raidCount += 1;
      memory.dangerEma = ema(
        memory.dangerEma,
        Math.min(1, memory.dangerEma + 0.2),
        TRADER_MEMORY.dangerEmaAlpha,
      );
    } else {
      memory.dangerEma = ema(memory.dangerEma, order.riskCost / 20, TRADER_MEMORY.dangerEmaAlpha);
    }

    const threshold = avoidThresholdForProfile(profile);
    if (memory.consecutiveFailures >= threshold) {
      addAvoidedRoute(
        world,
        traderId,
        order.sourceIslandId,
        order.destinationIslandId,
        order.commodityId,
        'repeated-failure',
      );
    }
  }

  updateRouteReputation(world, order, success, actualProfit, wasRaid);
  enforceMaxMemoriesPerTrader(world, traderId);
}

function updateRouteReputation(
  world: EconomyWorldState,
  order: DynamicTradeOrder,
  success: boolean,
  profit: number,
  wasRaid: boolean,
): void {
  const rep = getOrCreateRouteReputation(
    world,
    order.sourceIslandId,
    order.destinationIslandId,
    order.commodityId,
  );
  if (success) {
    rep.successfulTrips += 1;
    rep.averageProfit = ema(rep.averageProfit, profit, 0.2);
    rep.reputationScore = computeReputationScore(rep);
  } else {
    rep.failedTrips += 1;
    if (wasRaid) rep.raidCount += 1;
    rep.dangerEma = ema(rep.dangerEma, wasRaid ? 0.8 : 0.4, TRADER_MEMORY.dangerEmaAlpha);
    rep.reputationScore = computeReputationScore(rep);
  }
}

function computeReputationScore(rep: RouteReputation): number {
  const total = rep.successfulTrips + rep.failedTrips;
  const successRate = total > 0 ? rep.successfulTrips / total : 0.5;
  return (
    rep.averageProfit * 0.01
    + successRate * 10
    - rep.dangerEma * 8
    - rep.congestionEma * TRADER_MEMORY.congestionScoreWeight
  );
}

export function getOrCreateRouteReputation(
  world: EconomyWorldState,
  sourceId: EconomyCellId,
  destId: EconomyCellId,
  commodityId: LivingCommodityId,
): RouteReputation {
  const key = routeReputationKey(sourceId, destId, commodityId);
  let rep = world.routeReputations.find((r) => r.routeKey === key);
  if (!rep) {
    rep = {
      routeKey: key,
      sourceIslandId: sourceId,
      destinationIslandId: destId,
      commodityId,
      successfulTrips: 0,
      failedTrips: 0,
      raidCount: 0,
      averageProfit: 0,
      dangerEma: DYNAMIC_TRADE.baseRouteDanger,
      congestionEma: 0,
      reputationScore: 0,
    };
    world.routeReputations.push(rep);
  }
  return rep;
}

export function ensureRouteReputations(world: EconomyWorldState): void {
  if (world.routeReputations.length > 0) return;
  migrateRouteReputationsFromRoutes(world);
}

export function migrateRouteReputationsFromRoutes(world: EconomyWorldState): void {
  for (const route of world.routes) {
    const commodities = new Set<LivingCommodityId>();
    for (const cell of world.cells) {
      if (cell.id === route.sourceCellId || cell.id === route.targetCellId) {
        for (const id of Object.keys(cell.commodities) as LivingCommodityId[]) {
          if (cell.commodities[id]) commodities.add(id);
        }
      }
    }
    for (const commodityId of commodities) {
      const rep = getOrCreateRouteReputation(
        world,
        route.sourceCellId,
        route.targetCellId,
        commodityId,
      );
      rep.successfulTrips = Math.max(rep.successfulTrips, route.successfulTrips ?? 0);
      rep.failedTrips = Math.max(rep.failedTrips, route.failedTrips ?? 0);
      rep.dangerEma = route.danger ?? rep.dangerEma;
      rep.congestionEma = (route.traffic ?? 0) / Math.max(route.capacity ?? 4, 1);
      rep.reputationScore = computeReputationScore(rep);
    }
  }
}

export function tickTraderMemoryDecay(world: EconomyWorldState): void {
  ensureTraderMemoryState(world);
  pruneAvoidedRoutes(world);

  const toRemove: string[] = [];
  for (const memory of world.traderRouteMemories) {
    if (memory.lastUsedTick < world.tick) {
      memory.confidence = clampConfidence(
        memory.confidence - TRADER_MEMORY.confidenceDecayPerUnusedTick,
      );
    }
    const unused = world.tick - memory.lastUsedTick;
    if (
      unused > TRADER_MEMORY.memoryExpiryTicks
      && memory.confidence < 0.05
      && memory.tripCount < 3
    ) {
      toRemove.push(memory.key);
    }
  }
  if (toRemove.length) {
    world.traderRouteMemories = world.traderRouteMemories.filter(
      (m) => !toRemove.includes(m.key),
    );
  }

  for (const rep of world.routeReputations) {
    rep.congestionEma *= 0.995;
  }
}

function enforceMaxMemoriesPerTrader(world: EconomyWorldState, traderId: string): void {
  const traderMemories = world.traderRouteMemories
    .filter((m) => m.traderId === traderId)
    .sort((a, b) => b.lastUsedTick - a.lastUsedTick);
  if (traderMemories.length <= TRADER_MEMORY.maxMemoriesPerTrader) return;
  const drop = traderMemories.slice(TRADER_MEMORY.maxMemoriesPerTrader);
  const dropKeys = new Set(drop.map((m) => m.key));
  world.traderRouteMemories = world.traderRouteMemories.filter((m) => !dropKeys.has(m.key));
}

export function getCongestionLevel(route: TradeRouteState): number {
  const capacity = Math.max(route.capacity ?? 4, 1);
  return Math.min(2, (route.traffic ?? 0) / capacity);
}

export function getEffectiveTravelTicks(route: TradeRouteState): number {
  const congestion = getCongestionLevel(route);
  return route.travelTicks * (1 + congestion * TRADER_MEMORY.congestionTravelFactor);
}

export function updateRouteCongestion(
  world: EconomyWorldState,
  sourceId: EconomyCellId,
  destId: EconomyCellId,
  commodityId: LivingCommodityId,
): void {
  const route = world.routes.find(
    (r) => r.sourceCellId === sourceId && r.targetCellId === destId,
  );
  if (route) {
    route.traffic = (route.traffic ?? 0) + 0.25;
    const rep = getOrCreateRouteReputation(world, sourceId, destId, commodityId);
    rep.congestionEma = ema(
      rep.congestionEma,
      getCongestionLevel(route),
      0.15,
    );
    rep.reputationScore = computeReputationScore(rep);
  }
}

export function scoreRouteMemoryComponent(
  memory: TraderRouteMemory | undefined,
  reputation: RouteReputation | undefined,
  profile: TraderProfile,
): number {
  const memWeight = profile.memoryWeight;
  const repWeight = 1 - memWeight;

  let memScore = 0;
  if (memory && memory.tripCount > 0) {
    const conf = memory.confidence;
    memScore = (
      memory.profitEma * TRADER_MEMORY.profitMemoryWeight * 0.01
      + memory.successRateEma * TRADER_MEMORY.successMemoryWeight
      - memory.dangerEma * TRADER_MEMORY.dangerMemoryWeight * profile.lossAversion
      - memory.delayEma * TRADER_MEMORY.delayMemoryWeight
      - memory.spoilageEma * TRADER_MEMORY.spoilageMemoryWeight * 10
    ) * conf;
  }

  let repScore = 0;
  if (reputation) {
    repScore = reputation.reputationScore * repWeight;
  }

  if (memory && memory.confidence > 0.35) {
    return memScore * memWeight + repScore * (1 - memWeight * 0.5);
  }
  return memScore * 0.3 + repScore;
}

export function scoreFailurePenalty(memory: TraderRouteMemory | undefined, profile: TraderProfile): number {
  if (!memory) return 0;
  let penalty = 0;
  if (memory.lastFailureTick > memory.lastSuccessTick) {
    penalty += TRADER_MEMORY.recentFailurePenalty * profile.lossAversion;
  }
  if (memory.consecutiveFailures > 0) {
    penalty += memory.consecutiveFailures * TRADER_MEMORY.consecutiveFailureMultiplier * profile.lossAversion;
  }
  if (memory.consecutiveSuccesses >= 2) {
    penalty -= TRADER_MEMORY.recentSuccessBonus;
  }
  return penalty;
}

export function scoreUncertaintyPenalty(memory: TraderRouteMemory | undefined): number {
  if (!memory || memory.tripCount === 0) return 1.5;
  return (1 - memory.confidence) * 2;
}

export function scoreExplorationBonus(
  memory: TraderRouteMemory | undefined,
  profile: TraderProfile,
  profitPerSlot: number,
): number {
  const confidence = memory?.confidence ?? 0;
  const unexplored = memory?.tripCount === 0;
  const bonus = (1 - confidence) * profile.explorationRate * profitPerSlot;
  return bonus + (unexplored ? TRADER_MEMORY.newRouteExplorationBonus : 0);
}

export function scorePreference(
  profile: TraderProfile,
  commodityId: LivingCommodityId,
): number {
  const affinity = getCommodityAffinity(profile, commodityId);
  const preferred = profile.preferredCommodities.includes(commodityId) ? 2 : 0;
  return (affinity - 1) * 8 + preferred;
}

export function clearTraderMemory(world: EconomyWorldState, traderId: string): void {
  world.traderRouteMemories = world.traderRouteMemories.filter((m) => m.traderId !== traderId);
  world.avoidedRoutes = world.avoidedRoutes.filter((a) => a.traderId !== traderId);
  const profile = getTraderProfile(world, traderId);
  profile.avoidedRoutes = [];
  profile.commodityAffinity = {};
  profile.preferredCommodities = [];
}

export function resetRouteReputations(world: EconomyWorldState): void {
  world.routeReputations = [];
  ensureRouteReputations(world);
}
