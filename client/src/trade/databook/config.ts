import type { TradeSystemConfig } from '../types';

/** ค่าคงที่ระบบเทรดระหว่างเกาะ */
export const TRADE_SYSTEM_CONFIG: TradeSystemConfig = {
  currencyId: 'beli',
  sellFeePercent: 0.05,
  defaultBuyMultiplier: 1.0,
  defaultSellMultiplier: 0.65,
  importDemandBonus: 1.35,
  exportSurplusDiscount: 0.75,
  maxStackPerSlot: 99,
  defaultCargoSlots: 8,
} as const;

/** ความจุ cargo ต่อประเภทเรือ (ช่อง / น้ำหนักสูงสุด) */
export const BOAT_CARGO_CAPACITY: Readonly<
  Record<string, { slots: number; maxWeight: number }>
> = {
  'training-dinghy': { slots: 8, maxWeight: 120 },
  'swift-sloop': { slots: 12, maxWeight: 180 },
} as const;
