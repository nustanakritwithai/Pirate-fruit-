import { TRADE_SYSTEM_CONFIG } from './databook/config';
import type { CommodityDefinition, IslandMarketEntry } from './types';

/** ราคาซื้อจากร้าน (Beli ต่อหน่วย) */
export function buyPrice(
  commodity: CommodityDefinition,
  marketEntry: IslandMarketEntry,
): number {
  return Math.floor(commodity.basePrice * marketEntry.buyMultiplier);
}

/** ราคาขายให้ร้าน (หลังค่าธรรมเนียม) */
export function sellPrice(
  commodity: CommodityDefinition,
  marketEntry: IslandMarketEntry,
): number {
  const gross = commodity.basePrice * marketEntry.sellMultiplier;
  const afterFee = gross * (1 - TRADE_SYSTEM_CONFIG.sellFeePercent);
  return Math.floor(afterFee);
}

/** กำไรต่อหน่วยเมื่อซื้อที่เกาะ A ขายที่เกาะ B */
export function arbitrageProfitPerUnit(
  commodity: CommodityDefinition,
  buyEntry: IslandMarketEntry,
  sellEntry: IslandMarketEntry,
): number {
  const cost = buyPrice(commodity, buyEntry);
  const revenue = sellPrice(commodity, sellEntry);
  return revenue - cost;
}

/** น้ำหนักรวมของ cargo */
export function cargoTotalWeight(
  slots: readonly { commodityId: string; quantity: number }[],
  commodities: readonly CommodityDefinition[],
): number {
  let total = 0;
  for (const slot of slots) {
    const c = commodities.find((x) => x.id === slot.commodityId);
    if (c) total += c.weight * slot.quantity;
  }
  return total;
}

/** จำนวนช่องที่ใช้ (แต่ละ stack = 1 slot จนกว่าจะเต็ม maxStack) */
export function cargoSlotsUsed(
  slots: readonly { commodityId: string; quantity: number }[],
  maxStack = TRADE_SYSTEM_CONFIG.maxStackPerSlot,
): number {
  let used = 0;
  for (const slot of slots) {
    used += Math.ceil(slot.quantity / maxStack);
  }
  return used;
}

/** หาเส้นทางเทรดที่กำไรสูงสุดสำหรับสินค้า */
export function bestArbitrageForCommodity(
  commodity: CommodityDefinition,
  markets: readonly { islandId: string; entries: readonly IslandMarketEntry[] }[],
): { profit: number; fromIslandId: string; toIslandId: string } | null {
  let best: { profit: number; fromIslandId: string; toIslandId: string } | null = null;
  for (const from of markets) {
    const buyEntry = from.entries.find((e) => e.commodityId === commodity.id);
    if (!buyEntry) continue;
    for (const to of markets) {
      if (to.islandId === from.islandId) continue;
      const sellEntry = to.entries.find((e) => e.commodityId === commodity.id);
      if (!sellEntry) continue;
      const profit = arbitrageProfitPerUnit(commodity, buyEntry, sellEntry);
      if (!best || profit > best.profit) {
        best = { profit, fromIslandId: from.islandId, toIslandId: to.islandId };
      }
    }
  }
  return best && best.profit > 0 ? best : null;
}
