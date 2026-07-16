/**
 * TradeManager — ซื้อ/ขายสินค้า cargo บนเรือ
 * ราคาสินค้าหลัก (Living Trade) มาจาก LivingTradeSimulator
 */

import type { IslandId } from '../island/IslandTypes';
import type { CargoHold, CargoSlot, TradeTransactionListener, TradeTransactionResult } from './types';
import { BOAT_CARGO_CAPACITY, TRADE_SYSTEM_CONFIG } from './databook/config';
import {
  findMarketEntryOnIsland,
  getCommodity,
} from './TradeRegistry';
import { buyPrice, cargoSlotsUsed, cargoTotalWeight, sellPrice } from './TradeFormulas';
import { LivingTradeSimulator } from './living/LivingTradeSimulator';
import { isLivingCommodity } from './living/LivingTradeConfig';
import { gameStorage, type GameStorage } from '../persistence/GameStorage';
import { GAMEPLAY_STORAGE_KEYS } from '../persistence/storageKeys';

const STORAGE_KEY = GAMEPLAY_STORAGE_KEYS.cargo;

export interface TradeWallet {
  readonly coins: number;
  spendCoins(amount: number, reason: string): boolean;
  addCoins(amount: number, reason: string): void;
}

export class TradeManager {
  private cargo: CargoHold;
  private listener: TradeTransactionListener | null = null;
  readonly living: LivingTradeSimulator;

  constructor(
    private wallet: TradeWallet,
    private boatId: string = 'training-dinghy',
    livingSimulator?: LivingTradeSimulator,
    private readonly storage: GameStorage = gameStorage(),
  ) {
    this.living = livingSimulator ?? new LivingTradeSimulator();
    this.living.setContractWallet(wallet);
    this.cargo = this.loadCargo();
    this.applyBoatCapacity(boatId);
  }

  get walletCoins(): number {
    return this.wallet.coins;
  }

  get hold(): Readonly<CargoHold> {
    return this.cargo;
  }

  onTransaction(listener: TradeTransactionListener | null): void {
    this.listener = listener;
  }

  setBoat(boatId: string): void {
    this.boatId = boatId;
    this.applyBoatCapacity(boatId);
    this.saveCargo();
  }

  /** ราคาซื้อ — living หรือ static */
  resolveBuyPrice(islandId: IslandId, commodityId: string, quantity: number): number | null {
    const found = findMarketEntryOnIsland(islandId, commodityId);
    const livingPrice = this.living.getBuyPrice(islandId, commodityId, quantity);
    if (livingPrice != null) {
      return Math.max(1, Math.round(livingPrice * marketRoleMultiplier(found?.entry.role, 'buy')));
    }
    const commodity = getCommodity(commodityId);
    if (!commodity || !found) return null;
    return buyPrice(commodity, found.entry);
  }

  /** ราคาขาย — living หรือ static */
  resolveSellPrice(islandId: IslandId, commodityId: string, quantity: number): number | null {
    const found = findMarketEntryOnIsland(islandId, commodityId);
    const livingPrice = this.living.getSellPrice(islandId, commodityId, quantity);
    if (livingPrice != null) {
      return Math.max(1, Math.round(livingPrice * marketRoleMultiplier(found?.entry.role, 'sell')));
    }
    const commodity = getCommodity(commodityId);
    if (!commodity || !found) return null;
    return sellPrice(commodity, found.entry);
  }

  buy(islandId: IslandId, commodityId: string, quantity: number): TradeTransactionResult {
    return this.transact('buy', islandId, commodityId, quantity);
  }

  sell(islandId: IslandId, commodityId: string, quantity: number): TradeTransactionResult {
    return this.transact('sell', islandId, commodityId, quantity);
  }

  private transact(
    action: 'buy' | 'sell',
    islandId: IslandId,
    commodityId: string,
    quantity: number,
  ): TradeTransactionResult {
    const commodity = getCommodity(commodityId);
    const found = findMarketEntryOnIsland(islandId, commodityId);
    if (!commodity || !found) {
      return this.emit({ ok: false, message: 'ไม่พบสินค้าหรือตลาด' });
    }
    const entry = found.entry;
    if (!entry) {
      return this.emit({ ok: false, message: action === 'buy' ? 'ร้านไม่ขายสินค้านี้' : 'ร้านไม่รับซื้อสินค้านี้' });
    }

    const qty = Math.max(1, Math.floor(quantity));

    if (action === 'buy') {
      const stock = this.living.getTradableStock(islandId, commodityId);
      if (stock != null && stock < qty) {
        return this.emit({
          ok: false,
          message: `ขายได้อีก ${Math.floor(stock)} หน่วย (ส่วนที่เหลือเป็นคลังยังชีพของเมือง)`,
        });
      }
      const unitPrice = this.resolveBuyPrice(islandId, commodityId, qty);
      if (unitPrice == null) {
        return this.emit({ ok: false, message: 'ไม่สามารถคำนวณราคาได้' });
      }
      const totalCost = unitPrice * qty;
      if (this.wallet.coins < totalCost) {
        return this.emit({ ok: false, message: `ต้องการ ${totalCost} Beli (มี ${this.wallet.coins})` });
      }
      if (!this.canAddCargo(commodityId, qty)) {
        return this.emit({ ok: false, message: 'Cargo เต็มหรือน้ำหนักเกิน' });
      }
      if (!this.wallet.spendCoins(totalCost, `trade:buy:${commodityId}`)) {
        return this.emit({ ok: false, message: 'จ่ายเงินไม่สำเร็จ' });
      }
      if (isLivingCommodity(commodityId)) {
        this.living.applyPlayerBuy(islandId, commodityId, qty, unitPrice);
      }
      this.addToCargo(commodityId, qty);
      this.saveCargo();
      return this.emit({
        ok: true,
        message: `ซื้อ ${commodity.nameTh} x${qty}`,
        coinsDelta: -totalCost,
        commodityId,
        quantityDelta: qty,
        islandId,
        action,
      });
    }

    const available = this.getCargoQuantity(commodityId);
    if (available < qty) {
      return this.emit({ ok: false, message: `มีในคลังแค่ ${available}` });
    }
    const unitPrice = this.resolveSellPrice(islandId, commodityId, qty);
    if (unitPrice == null) {
      return this.emit({ ok: false, message: 'ไม่สามารถคำนวณราคาได้' });
    }
    const totalGain = unitPrice * qty;
    const feeRate = this.living.getFeeModifierForIsland(islandId);
    const feeAmount = Math.round(totalGain * feeRate);
    const netGain = totalGain - feeAmount;
    this.removeFromCargo(commodityId, qty);
    if (isLivingCommodity(commodityId)) {
      this.living.applyPlayerSell(islandId, commodityId, qty, unitPrice);
    }
    this.wallet.addCoins(netGain, `trade:sell:${commodityId}`);
    this.saveCargo();
    return this.emit({
      ok: true,
      message: `ขาย ${commodity.nameTh} x${qty} ได้ ${netGain} Beli${feeAmount > 0 ? ` (ค่าธรรมเนียม ${feeAmount})` : ''}`,
      coinsDelta: netGain,
      commodityId,
      quantityDelta: -qty,
      islandId,
      action,
    });
  }

  acceptContract(contractId: string) {
    return this.living.acceptPlayerContract(contractId);
  }

  abandonContract(contractId: string) {
    return this.living.abandonPlayerContract(contractId);
  }

  trackContract(contractId: string | null) {
    this.living.trackPlayerContract(contractId);
  }

  get trackedContract() {
    return this.living.getTrackedPlayerContract();
  }

  get playerEconomy() {
    return this.living.playerEconomy;
  }

  private emit(result: TradeTransactionResult): TradeTransactionResult {
    if (result.ok) this.listener?.(result);
    return result;
  }

  private canAddCargo(commodityId: string, quantity: number): boolean {
    const commodity = getCommodity(commodityId);
    if (!commodity) return false;

    const trial = [...this.cargo.slots];
    const existing = trial.find((s) => s.commodityId === commodityId);
    if (existing) existing.quantity += quantity;
    else trial.push({ commodityId, quantity });

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
    if (this.cargo.slots[idx].quantity <= 0) this.cargo.slots.splice(idx, 1);
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
      const raw = JSON.parse(this.storage.getItem(STORAGE_KEY) ?? '{}') as Partial<CargoHold>;
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
    this.storage.setItem(STORAGE_KEY, JSON.stringify(this.cargo));
  }

  private isValidSlot(s: unknown): s is CargoSlot {
    if (!s || typeof s !== 'object') return false;
    const o = s as CargoSlot;
    return typeof o.commodityId === 'string' && typeof o.quantity === 'number' && o.quantity > 0;
  }
}

function marketRoleMultiplier(
  role: 'export' | 'import' | 'neutral' | undefined,
  action: 'buy' | 'sell',
): number {
  if (role === 'export') return action === 'buy' ? 0.9 : 0.9;
  if (role === 'import') return action === 'buy' ? 1.2 : 1.12;
  return 1;
}
