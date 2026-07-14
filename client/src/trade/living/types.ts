/** Living Trade Network — Game of Life-style dynamic island economy */

import type { IslandId } from '../../island/IslandTypes';

/** สินค้าหลักของต้นแบบ Living Trade */
export type LivingCommodityId = 'fresh-fish' | 'hardwood' | 'iron-ore' | 'sun-silk';

export interface CommodityState {
  stock: number;
  production: number;
  consumption: number;
  demand: number;
  /** คูณความต้องการชั่วคราว (เทศกาล, วิกฤต) */
  demandMultiplier: number;
  basePrice: number;
  currentPrice: number;
  /** สต็อกเป้าหมายสำหรับคำนวณ scarcity */
  targetStock: number;
  /** ราคาก่อน tick ล่าสุด — ใช้แสดงแนวโน้ม */
  previousPrice: number;
}

export interface TradeIslandState {
  id: IslandId;
  population: number;
  stability: number;
  portLevel: number;
  pirateThreat: number;
  marineInfluence: number;
  wealth: number;
  commodities: Record<LivingCommodityId, CommodityState>;
  /** เกาะที่เชื่อมทางเรือ */
  routeTargets: IslandId[];
}

export interface TradeRouteState {
  sourceIslandId: IslandId;
  targetIslandId: IslandId;
  safety: number;
  traffic: number;
  pirateActivity: number;
  stormRisk: number;
  transportCapacity: number;
}

export interface TradeShip {
  id: string;
  originIslandId: IslandId;
  destinationIslandId: IslandId;
  cargo: Partial<Record<LivingCommodityId, number>>;
  travelTimeRemaining: number;
  dangerRisk: number;
}

export interface TradeNewsItem {
  id: string;
  message: string;
  islandId?: IslandId;
  commodityId?: LivingCommodityId;
  createdAt: number;
  /** อายุข่าว (ms) */
  ttlMs: number;
}

export interface TradeWorldState {
  tick: number;
  islands: TradeIslandState[];
  routes: TradeRouteState[];
  ships: TradeShip[];
  news: TradeNewsItem[];
}
