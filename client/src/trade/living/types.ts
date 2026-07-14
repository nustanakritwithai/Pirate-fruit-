/**
 * Economic Cellular Automata — หนึ่งเกาะต่อหนึ่งเซลล์
 * สินค้าเกิด เติบโต ขาดแคลน ล้นตลาด เคลื่อนย้าย และส่งผลต่อสินค้าอื่น
 */

import type { IslandId } from '../../island/IslandTypes';

/** เซลล์เศรษฐกิจ (แยกจากเกาะในเกม — 4 เซลล์บน 3 เกาะจริง) */
export type EconomyCellId = 'leaf-island' | 'mine-island' | 'cloth-island' | 'shipyard-island';

export type EconomyRole = 'forest' | 'mine' | 'cloth' | 'shipyard';

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
  | 'trade-crate';

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
  /** กำลังขนส่ง — เพิ่มเมื่อมีชิ้นส่วนเรือมาก */
  transportCapacity: number;
  commodities: Partial<Record<LivingCommodityId, CommodityState>>;
  neighbors: EconomyCellId[];
}

export interface TradeRouteState {
  sourceCellId: EconomyCellId;
  targetCellId: EconomyCellId;
  travelTicks: number;
  transportCost: number;
}

export interface CargoShip {
  id: string;
  originCellId: EconomyCellId;
  destinationCellId: EconomyCellId;
  cargo: Partial<Record<LivingCommodityId, number>>;
  travelTimeRemaining: number;
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
}

export interface EconomyWorldState {
  tick: number;
  cells: EconomyCellState[];
  routes: TradeRouteState[];
  ships: CargoShip[];
  news: TradeNewsItem[];
  log: EconomyLogEntry[];
  /** ticks จนกว่าเรือ NPC จะออกครั้งถัดไป */
  npcCooldown: number;
  /** ชิ้นส่วนเรือล้น → เพิ่มกำลังขนส่ง NPC */
  npcCargoCapacityMultiplier: number;
  /** หีบสินค้าเพียงพอ → ลด spoilage (0–0.5) */
  spoilageReduction: number;
}
