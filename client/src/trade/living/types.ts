/**
 * Economic Cellular Automata — หนึ่งเกาะต่อหนึ่งเซลล์
 * สินค้าเกิด เติบโต ขาดแคลน ล้นตลาด เคลื่อนย้าย และส่งผลต่อสินค้าอื่น
 */

import type { IslandId } from '../../island/IslandTypes';

/** เซลล์เศรษฐกิจ — ทุกเกาะที่ผู้เล่นเดินทางไปถึงมีแหล่งผลิตและสต็อกของตัวเอง */
export type EconomyCellId =
  | 'leaf-island'
  | 'mine-island'
  | 'cloth-island'
  | 'shipyard-island'
  | 'frost-island'
  | 'sky-island'
  | 'volcano-island';

export type EconomyRole = 'forest' | 'mine' | 'cloth' | 'shipyard' | 'frost' | 'sky' | 'volcano';

/** สินค้าในระบบ living (map กับ TRADE_COMMODITIES) */
export type LivingCommodityId =
  | 'fresh-fish'
  | 'dried-fish'
  | 'hardwood'
  | 'iron-ore'
  | 'iron-ingot'
  | 'tools'
  | 'sun-silk'
  | 'rope'
  | 'luxury-cloth'
  | 'healing-herb'
  | 'herbal-medicine'
  | 'sailcloth'
  | 'repair-kit'
  | 'trade-crate'
  | 'frost-crystal'
  | 'storm-core'
  | 'volcanic-ore';

export type MarketState = 'surplus' | 'balanced' | 'shortage' | 'crisis' | 'collapsed';

export type PriceTrend = 'rising' | 'stable' | 'falling';

export interface MarketMemory {
  recentBuyVolume: number;
  recentSellVolume: number;
  shortageTicks: number;
  surplusTicks: number;
  averagePrice: number;
}

export interface CommodityState {
  stock: number;
  production: number;
  /** กำลังผลิตฐาน — ใช้ปรับเมื่อล้น/ขาด */
  baseProduction: number;
  consumption: number;
  demand: number;
  baseDemand: number;
  importDemand: number;
  exportDemand: number;
  targetStock: number;
  basePrice: number;
  currentPrice: number;
  previousPrice: number;
  trend: PriceTrend;
  marketState: MarketState;
  memory: MarketMemory;
  /** สินค้าเสื่อมสภาพได้ (อาหาร) */
  perishable: boolean;
}

export interface EconomyCellState {
  id: EconomyCellId;
  role: EconomyRole;
  /** เกาะในเกมที่ผู้เล่นเทรดได้ */
  gameIslandId: IslandId;
  nameTh: string;
  population: number;
  /** 0–1 กำลังแรงงาน (ลดเมื่อขาดอาหาร) */
  workforce: number;
  /** แรงงานว่างรับจ้างได้ */
  availableWorkforce: number;
  /** ว่างงาน — ส่งผลต่อ demand */
  unemployment: number;
  /** ค่าแรงพื้นฐานต่อคน */
  wageLevel: number;
  /** กำลังขนส่ง — เพิ่มเมื่อมีชิ้นส่วนเรือมาก */
  transportCapacity: number;
  commodities: Partial<Record<LivingCommodityId, CommodityState>>;
  neighbors: EconomyCellId[];
}

export type TradeOrderStatus =
  | 'open'
  | 'assigned'
  | 'in-transit'
  | 'completed'
  | 'expired'
  | 'failed';

/** Phase E2 — คำสั่งขนส่งจาก shortage/surplus จริง */
export interface DynamicTradeOrder {
  id: string;
  commodityId: LivingCommodityId;
  sourceIslandId: EconomyCellId;
  destinationIslandId: EconomyCellId;
  requestedAmount: number;
  remainingAmount: number;
  sourceBuyPrice: number;
  destinationSellPrice: number;
  expectedRevenue: number;
  purchaseCost: number;
  transportCost: number;
  riskCost: number;
  spoilageCost: number;
  expectedProfit: number;
  profitPerCargoSlot: number;
  urgency: number;
  travelTicks: number;
  createdTick: number;
  expiresAtTick: number;
  status: TradeOrderStatus;
  assignedTraderId?: string;
  /** Phase E3.5 — player contract reservation */
  playerReservedAmount?: number;
  playerContractId?: string;
  npcAssignableAfterTick?: number;
}

export interface CommodityReservation {
  cellId: EconomyCellId;
  commodityId: LivingCommodityId;
  amount: number;
  orderId: string;
  reservedAtTick: number;
}

export interface TraderAgentState {
  id: string;
  /** ฐานปฏิบัติการ */
  cellId: EconomyCellId;
  nameTh: string;
  /** 0–1 สูง = ยอมรับความเสี่ยง */
  riskTolerance: number;
  cargoCapacity: number;
  cooldown: number;
  totalProfit: number;
  activeOrderId?: string;
}

export type TraderPersonality =
  | 'conservative'
  | 'balanced'
  | 'aggressive'
  | 'opportunist';

/** Phase E3 — บุคลิกและสถิติตลอดชีพของ Trader */
export interface TraderProfile {
  traderId: string;
  personality: TraderPersonality;
  riskTolerance: number;
  explorationRate: number;
  memoryWeight: number;
  recencyBias: number;
  lossAversion: number;
  preferredCommodities: LivingCommodityId[];
  avoidedRoutes: string[];
  lifetimeProfit: number;
  completedTrips: number;
  failedTrips: number;
  commodityAffinity: Partial<Record<LivingCommodityId, number>>;
}

/** Phase E3 — ความจำต่อเส้นทางและสินค้าของแต่ละ Trader */
export interface TraderRouteMemory {
  key: string;
  traderId: string;
  sourceIslandId: EconomyCellId;
  destinationIslandId: EconomyCellId;
  commodityId: LivingCommodityId;
  tripCount: number;
  successfulTrips: number;
  failedTrips: number;
  raidCount: number;
  spoilageLoss: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  averageProfit: number;
  averageProfitPerSlot: number;
  averageTravelTicks: number;
  averageRiskCost: number;
  profitEma: number;
  successRateEma: number;
  dangerEma: number;
  delayEma: number;
  spoilageEma: number;
  confidence: number;
  lastUsedTick: number;
  lastSuccessTick: number;
  lastFailureTick: number;
  consecutiveSuccesses: number;
  consecutiveFailures: number;
}

export type AvoidRouteReason =
  | 'repeated-failure'
  | 'high-danger'
  | 'high-spoilage'
  | 'unprofitable';

export interface AvoidedRouteState {
  traderId: string;
  routeKey: string;
  avoidUntilTick: number;
  reason: AvoidRouteReason;
}

/** Phase E3 — ชื่อเสียงเส้นทางระดับโลก */
export interface RouteReputation {
  routeKey: string;
  sourceIslandId: EconomyCellId;
  destinationIslandId: EconomyCellId;
  commodityId: LivingCommodityId;
  successfulTrips: number;
  failedTrips: number;
  raidCount: number;
  averageProfit: number;
  dangerEma: number;
  congestionEma: number;
  reputationScore: number;
}

export interface TradeRouteState {
  sourceCellId: EconomyCellId;
  targetCellId: EconomyCellId;
  travelTicks: number;
  transportCost: number;
  /** Phase E2 — ข้อมูลเส้นทาง (ไม่บังคับ NPC) */
  distance?: number;
  danger?: number;
  traffic?: number;
  capacity?: number;
  successfulTrips?: number;
  failedTrips?: number;
}

export interface CargoShip {
  id: string;
  originCellId: EconomyCellId;
  destinationCellId: EconomyCellId;
  cargo: Partial<Record<LivingCommodityId, number>>;
  travelTimeRemaining: number;
  orderId?: string;
  traderId?: string;
  /** Phase E3 — สำหรับ delay memory */
  plannedTravelTicks?: number;
  departTick?: number;
  spoilageLost?: number;
  wasRaided?: boolean;
}

export interface EconomyLogEntry {
  tick: number;
  message: string;
  cellId?: EconomyCellId;
  commodityId?: LivingCommodityId;
}

export interface TradeNewsItem {
  id: string;
  message: string;
  cellId?: EconomyCellId;
  commodityId?: LivingCommodityId;
  createdAt: number;
  ttlMs: number;
  priority?: import('./EconomyEventClassifier').EconomyEventPriority;
}

export interface EconomyWorldState {
  tick: number;
  cells: EconomyCellState[];
  routes: TradeRouteState[];
  ships: CargoShip[];
  news: TradeNewsItem[];
  log: EconomyLogEntry[];
  /** Adaptive factory agents (Phase E1) */
  factories: FactoryAgentState[];
  /** Phase E2 — dynamic trade orders */
  orders: DynamicTradeOrder[];
  traders: TraderAgentState[];
  reservations: CommodityReservation[];
  /** cooldown สร้าง order ต่อเกาะปลายทาง */
  orderGenCooldowns: Partial<Record<EconomyCellId, number>>;
  /** ticks จนกว่าเรือ NPC จะออกครั้งถัดไป */
  npcCooldown: number;
  /** ชิ้นส่วนเรือล้น → เพิ่มกำลังขนส่ง NPC */
  npcCargoCapacityMultiplier: number;
  /** หีบสินค้าเพียงพอ → ลด spoilage (0–0.5) */
  spoilageReduction: number;
  /** Phase E3 — trader learning */
  traderProfiles: TraderProfile[];
  traderRouteMemories: TraderRouteMemory[];
  avoidedRoutes: AvoidedRouteState[];
  routeReputations: RouteReputation[];
  traderRngSeed: number;
  /** Phase E3.5 — player influence & contracts */
  playerEconomy?: import('./PlayerEconomyTypes').PlayerEconomyState;
  /** Phase E4A — evolutionary economy genome */
  genomeState?: import('./EconomyGenomeTypes').EconomyGenomeWorldState;
}

export type FactoryStatus =
  | 'expanding'
  | 'operating'
  | 'reducing'
  | 'paused'
  | 'recovering';

export type FactoryDecision =
  | 'expand'
  | 'hold'
  | 'reduce'
  | 'pause'
  | 'reopen'
  | 'switch-recipe';

export interface FactoryAgentState {
  id: string;
  cellId: EconomyCellId;
  /** สูตรเริ่มต้นของ agent นี้ */
  recipeId: LivingCommodityId;
  status: FactoryStatus;
  outputScale: number;
  workforceAssigned: number;
  expectedUnitProfit: number;
  profitEma: number;
  profitableTicks: number;
  unprofitableTicks: number;
  shortageTicks: number;
  adaptationCooldown: number;
  pausedTicks: number;
  activeRecipeId: LivingCommodityId;
  alternativeRecipeIds: LivingCommodityId[];
  lastDecision: FactoryDecision;
  retoolingTicks: number;
  recipeSwitchCooldown: number;
  /** เหตุผลล่าสุดสำหรับ UI */
  lastReasons: string[];
}

export type FactoryEventType =
  | 'FACTORY_EXPANDED'
  | 'FACTORY_REDUCED'
  | 'FACTORY_PAUSED'
  | 'FACTORY_REOPENED'
  | 'FACTORY_RECIPE_SWITCHED';

export interface FactoryEvent {
  type: FactoryEventType;
  agent: FactoryAgentState;
  cellName: string;
  message: string;
  toastEligible: boolean;
}
