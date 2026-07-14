/**
 * TradeManager — runtime scaffold สำหรับซื้อ/ขายสินค้าและ cargo บนเรือ
 * ยังไม่ wire เข้า main.ts — เตรียม API สำหรับ Phase เทรดระหว่างเกาะ
 */

import type { IslandId } from '../island/IslandTypes';
import type { CargoHold, CargoSlot, TradeTransactionResult } from './types';
import { BOAT_CARGO_CAPACITY, TRADE_SYSTEM_CONFIG } from './databook/config';
import {
  buyPrice,
  cargoSlotsUsed,
  cargoTotalWeight,
  sellPrice,
} from './TradeFormulas';
import {
  getCommodity,
  getMarketEntry,
  getMarketForIsland,
} from './TradeRegistry';

const STORAGE_KEY = 'pirate-fruit:cargo-v1';

export interface TradeWallet {
  readonly coins: number;
  spendCoins(amount: number, reason: string): boolean;
  addCoins(amount: number, reason: string): void;
}

export class TradeManager {
  private cargo: CargoHold;

  constructor(
    private wallet: TradeWallet,
    private boatId: string = 'training-dinghy',
  ) {
    this.cargo = this.loadCargo();
    this.applyBoatCapacity(boatId);
  }

  get hold(): Readonly<CargoHold> {
    return this.cargo;
  }

  setBoat(boatId: string): void {
    this.boatId = boatId;
    this.applyBoatCapacity(boatId);
    this.saveCargo();
  }

  /** ซื้อสินค้าจากตลาดเกาะ */
  buy(
    islandId: IslandId,
    commodityId: string,
    quantity: number,
  ): TradeTransactionResult {
    const market = getMarketForIsland(islandId);
    const commodity = getCommodity(commodityId);
    if (!market || !commodity) {
      return { ok: false, message: 'ไม่พบสินค้าหรือตลาด' };
    }
    const entry = getMarketEntry(market.id, commodityId);
    if (!entry) return { ok: false, message: 'ร้านไม่ขายสินค้านี้' };

    const qty = Math.max(1, Math.floor(quantity));
    const unitPrice = buyPrice(commodity, entry);
    const totalCost = unitPrice * qty;

    if (this.wallet.coins < totalCost) {
      return { ok: false, message: `ต้องการ ${totalCost} Beli (มี ${this.wallet.coins})` };
    }
    if (!this.canAddCargo(commodityId, qty)) {
      return { ok: false, message: 'Cargo เต็มหรือน้ำหนักเกิน' };
    }

    if (!this.wallet.spendCoins(totalCost, `trade:buy:${commodityId}`)) {
      return { ok: false, message: 'จ่ายเงินไม่สำเร็จ' };
    }
    this.addToCargo(commodityId, qty);
    this.saveCargo();
    return {
      ok: true,
      message: `ซื้อ ${commodity.nameTh} x${qty}`,
      coinsDelta: -totalCost,
      commodityId,
      quantityDelta: qty,
    };
  }

  /** ขายสินค้าให้ตลาดเกาะ */
  sell(
    islandId: IslandId,
    commodityId: string,
    quantity: number,
  ): TradeTransactionResult {
    const market = getMarketForIsland(islandId);
    const commodity = getCommodity(commodityId);
    if (!market || !commodity) {
      return { ok: false, message: 'ไม่พบสินค้าหรือตลาด' };
    }
    const entry = getMarketEntry(market.id, commodityId);
    if (!entry) return { ok: false, message: 'ร้านไม่รับซื้อสินค้านี้' };

    const qty = Math.max(1, Math.floor(quantity));
    const available = this.getCargoQuantity(commodityId);
    if (available < qty) {
      return { ok: false, message: `มีในคลังแค่ ${available}` };
    }

    const unitPrice = sellPrice(commodity, entry);
    const totalGain = unitPrice * qty;

    this.removeFromCargo(commodityId, qty);
    this.wallet.addCoins(totalGain, `trade:sell:${commodityId}`);
    this.saveCargo();
    return {
      ok: true,
      message: `ขาย ${commodity.nameTh} x${qty} ได้ ${totalGain} Beli`,
      coinsDelta: totalGain,
      commodityId,
      quantityDelta: -qty,
    };
  }

  private canAddCargo(commodityId: string, quantity: number): boolean {
    const commodity = getCommodity(commodityId);
    if (!commodity) return false;

    const trial = [...this.cargo.slots];
    const existing = trial.find((s) => s.commodityId === commodityId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      trial.push({ commodityId, quantity });
    }

    const cap = BOAT_CARGO_CAPACITY[this.boatId] ?? {
      slots: TRADE_SYSTEM_CONFIG.defaultCargoSlots,
      maxWeight: 120,
    };
    const commodities = trial
      .map((s) => getCommodity(s.commodityId))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));

    return (
      cargoSlotsUsed(trial) <= cap.slots &&
      cargoTotalWeight(trial, commodities) <= cap.maxWeight
    );
  }

  private addToCargo(commodityId: string, quantity: number): void {
    const slot = this.cargo.slots.find((s) => s.commodityId === commodityId);
    if (slot) slot.quantity += quantity;
    else this.cargo.slots.push({ commodityId, quantity });
  }

  private removeFromCargo(commodityId: string, quantity: number): void {
    const idx = this.cargo.slots.findIndex((s) => s.commodityId === commodityId);
    if (idx < 0) return;
    this.cargo.slots[idx].quantity -= quantity;
    if (this.cargo.slots[idx].quantity <= 0) {
      this.cargo.slots.splice(idx, 1);
    }
  }

  private getCargoQuantity(commodityId: string): number {
    return this.cargo.slots.find((s) => s.commodityId === commodityId)?.quantity ?? 0;
  }

  private applyBoatCapacity(boatId: string): void {
    const cap = BOAT_CARGO_CAPACITY[boatId] ?? {
      slots: TRADE_SYSTEM_CONFIG.defaultCargoSlots,
      maxWeight: 120,
    };
    this.cargo.maxSlots = cap.slots;
    this.cargo.maxWeight = cap.maxWeight;
  }

  private loadCargo(): CargoHold {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<CargoHold>;
      return {
        maxSlots: raw.maxSlots ?? TRADE_SYSTEM_CONFIG.defaultCargoSlots,
        maxWeight: raw.maxWeight ?? 120,
        slots: Array.isArray(raw.slots) ? raw.slots.filter(this.isValidSlot) : [],
      };
    } catch {
      return { maxSlots: TRADE_SYSTEM_CONFIG.defaultCargoSlots, maxWeight: 120, slots: [] };
    }
  }

  private saveCargo(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.cargo));
  }

  private isValidSlot(s: unknown): s is CargoSlot {
    if (!s || typeof s !== 'object') return false;
    const o = s as CargoSlot;
    return typeof o.commodityId === 'string' && typeof o.quantity === 'number' && o.quantity > 0;
  }
}
