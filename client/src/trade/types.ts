/** ระบบเทรดระหว่างเกาะ — อ้างอิง IslandRegistry + ระบบเรือ */

import type { IslandId } from '../island/IslandTypes';

export type CommodityCategory =
  | 'food'
  | 'material'
  | 'luxury'
  | 'relic'
  | 'supply';

export type VendorKind = 'general' | 'harbor' | 'black-market' | 'caravan';

export interface TradeSystemConfig {
  /** สกุลเงินหลัก (ต่อกับ coins ใน ProgressionState) */
  currencyId: 'beli';
  /** ค่าธรรมเนียมขาย (% จากราคาขาย) */
  sellFeePercent: number;
  /** ราคาซื้อจากร้าน = base × buyMultiplier */
  defaultBuyMultiplier: number;
  /** ราคาขายให้ร้าน = base × sellMultiplier */
  defaultSellMultiplier: number;
  /** โบนัสราคาเมื่อขายของที่เกาะต้องการ (import demand) */
  importDemandBonus: number;
  /** ส่วนลดเมื่อซื้อของที่เกาะผลิต (export surplus) */
  exportSurplusDiscount: number;
  /** จำนวนสินค้าสูงสุดต่อช่อง cargo */
  maxStackPerSlot: number;
  /** cargo เริ่มต้นของเรือพายฝึกหัด */
  defaultCargoSlots: number;
}

export interface CommodityDefinition {
  id: string;
  name: string;
  nameTh: string;
  category: CommodityCategory;
  /** ราคาฐาน Beli ต่อหน่วย */
  basePrice: number;
  /** น้ำหนักต่อหน่วย (ใช้คำนวณ cargo) */
  weight: number;
  icon: string;
  description: string;
}

export interface IslandMarketEntry {
  commodityId: string;
  /** เกาะนี้ผลิต/ส่งออก — ซื้อถูก ขายถูก */
  role: 'export' | 'import' | 'neutral';
  /** คูณกับ basePrice เมื่อซื้อจากร้าน */
  buyMultiplier: number;
  /** คูณกับ basePrice เมื่อขายให้ร้าน */
  sellMultiplier: number;
  /** จำกัดสต็อกต่อรอบรีเฟรช (-1 = ไม่จำกัด) */
  stockLimit: number;
}

export interface IslandMarketDefinition {
  id: string;
  islandId: IslandId;
  name: string;
  nameTh: string;
  harborDockId: string;
  entries: readonly IslandMarketEntry[];
}

export interface TradeRouteDefinition {
  id: string;
  name: string;
  nameTh: string;
  fromIslandId: IslandId;
  toIslandId: IslandId;
  fromDockId: string;
  toDockId: string;
  /** ระยะทางโดยประมาณ (หน่วย world) — ใช้คำนวณเวลา/ค่าใช้จ่าย */
  distance: number;
  recommendedCommodityIds: readonly string[];
  notes?: string;
}

export interface TradeVendorDefinition {
  id: string;
  islandId: IslandId;
  name: string;
  nameTh: string;
  kind: VendorKind;
  marketId: string;
  /** พิกัดโลก (x, z) */
  x: number;
  z: number;
  dialogueOpen: string;
}

export interface TradeRule {
  id: string;
  rule: string;
  ruleTh: string;
}

/** สถานะ cargo บนเรือ (persist) */
export interface CargoSlot {
  commodityId: string;
  quantity: number;
}

export interface CargoHold {
  maxSlots: number;
  maxWeight: number;
  slots: CargoSlot[];
}

export interface TradeTransactionResult {
  ok: boolean;
  message: string;
  coinsDelta?: number;
  commodityId?: string;
  quantityDelta?: number;
  islandId?: string;
  action?: 'buy' | 'sell';
}

export type TradeTransactionListener = (result: TradeTransactionResult) => void;
