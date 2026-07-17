/**
 * สูตรราคา/ความจุ cargo กลาง (pure) — แหล่งเดียวที่ TradeManager (browser)
 * และ economy engine bundle (server, S8 trade authority) ใช้ร่วมกัน
 * เพื่อไม่ให้สูตรสองฝั่ง drift จากกัน
 */

import type { IslandId } from '../island/IslandTypes';
import type { CargoSlot } from './types';
import { BOAT_CARGO_CAPACITY, TRADE_SYSTEM_CONFIG } from './databook/config';
import { findMarketEntryOnIsland, getCommodity } from './TradeRegistry';
import { buyPrice, cargoSlotsUsed, cargoTotalWeight, sellPrice } from './TradeFormulas';
import type { LivingTradeSimulator } from './living/LivingTradeSimulator';

export function marketRoleMultiplier(
  role: 'export' | 'import' | 'neutral' | undefined,
  action: 'buy' | 'sell',
): number {
  if (role === 'export') return action === 'buy' ? 0.9 : 0.9;
  if (role === 'import') return action === 'buy' ? 1.2 : 1.12;
  return 1;
}

/** ราคาซื้อต่อหน่วย — living หรือ static (null = ตลาดนี้ไม่ขายสินค้านี้) */
export function resolveBuyUnitPrice(
  living: LivingTradeSimulator,
  islandId: IslandId,
  commodityId: string,
  quantity: number,
): number | null {
  const found = findMarketEntryOnIsland(islandId, commodityId);
  const livingPrice = living.getBuyPrice(islandId, commodityId, quantity);
  if (livingPrice != null) {
    return Math.max(1, Math.round(livingPrice * marketRoleMultiplier(found?.entry.role, 'buy')));
  }
  const commodity = getCommodity(commodityId);
  if (!commodity || !found) return null;
  return buyPrice(commodity, found.entry);
}

/** ราคาขายต่อหน่วย — living หรือ static (null = ตลาดนี้ไม่รับซื้อ) */
export function resolveSellUnitPrice(
  living: LivingTradeSimulator,
  islandId: IslandId,
  commodityId: string,
  quantity: number,
): number | null {
  const found = findMarketEntryOnIsland(islandId, commodityId);
  const livingPrice = living.getSellPrice(islandId, commodityId, quantity);
  if (livingPrice != null) {
    return Math.max(1, Math.round(livingPrice * marketRoleMultiplier(found?.entry.role, 'sell')));
  }
  const commodity = getCommodity(commodityId);
  if (!commodity || !found) return null;
  return sellPrice(commodity, found.entry);
}

export function cargoCapacityFor(boatId: string): { slots: number; maxWeight: number } {
  return (
    BOAT_CARGO_CAPACITY[boatId] ?? {
      slots: TRADE_SYSTEM_CONFIG.defaultCargoSlots,
      maxWeight: 120,
    }
  );
}

/** เพิ่มสินค้าลง cargo แล้วยังอยู่ในเพดาน slot/น้ำหนักของเรือไหม (pure) */
export function cargoFits(
  boatId: string,
  slots: readonly CargoSlot[],
  commodityId: string,
  quantity: number,
): boolean {
  const commodity = getCommodity(commodityId);
  if (!commodity) return false;

  const trial = slots.map((slot) => ({ ...slot }));
  const existing = trial.find((slot) => slot.commodityId === commodityId);
  if (existing) existing.quantity += quantity;
  else trial.push({ commodityId, quantity });

  const cap = cargoCapacityFor(boatId);
  const commodities = trial
    .map((slot) => getCommodity(slot.commodityId))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  return cargoSlotsUsed(trial) <= cap.slots && cargoTotalWeight(trial, commodities) <= cap.maxWeight;
}
