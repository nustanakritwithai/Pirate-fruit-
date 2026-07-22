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
import { cargoFits, resolveBuyUnitPrice, resolveSellUnitPrice } from './TradePricing';
import { LivingTradeSimulator } from './living/LivingTradeSimulator';
import { isLivingCommodity } from './living/LivingTradeConfig';
import { gameStorage, type GameStorage } from '../persistence/GameStorage';
import { GAMEPLAY_STORAGE_KEYS } from '../persistence/storageKeys';
import { RemoteTradeError, type RemoteTradeExecutor } from './RemoteTradeClient';

const STORAGE_KEY = GAMEPLAY_STORAGE_KEYS.cargo;

export interface TradeWallet {
  readonly coins: number;
  spendCoins(amount: number, reason: string): boolean;
  addCoins(amount: number, reason: string): void;
}

export class TradeManager {
  private cargo: CargoHold;
  private listener: TradeTransactionListener | null = null;
  private remote: RemoteTradeExecutor | null = null;
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

  /** ราคาซื้อ — living หรือ static (สูตรกลางใน TradePricing ใช้ร่วมกับ server) */
  resolveBuyPrice(islandId: IslandId, commodityId: string, quantity: number): number | null {
    return resolveBuyUnitPrice(this.living, islandId, commodityId, quantity);
  }

  /** ราคาขาย — living หรือ static */
  resolveSellPrice(islandId: IslandId, commodityId: string, quantity: number): number | null {
    return resolveSellUnitPrice(this.living, islandId, commodityId, quantity);
  }

  buy(islandId: IslandId, commodityId: string, quantity: number): TradeTransactionResult {
    return this.transact('buy', islandId, commodityId, quantity);
  }

  sell(islandId: IslandId, commodityId: string, quantity: number): TradeTransactionResult {
    return this.transact('sell', islandId, commodityId, quantity);
  }

  /** S8: เปิด/ปิดโหมด Server ตัดสินธุรกรรม (null = โหมด local เดิมทุกประการ) */
  setRemoteExecutor(executor: RemoteTradeExecutor | null): void {
    this.remote = executor;
  }

  get isRemoteTrade(): boolean {
    return this.remote !== null;
  }

  /** ซื้อ/ขายแบบรอผลจริง — ใช้ Server เมื่อเปิด trade authority, ไม่งั้น local เดิม */
  async buyAsync(islandId: IslandId, commodityId: string, quantity: number): Promise<TradeTransactionResult> {
    if (!this.remote) return this.buy(islandId, commodityId, quantity);
    return this.transactRemote('buy', islandId, commodityId, quantity);
  }

  async sellAsync(islandId: IslandId, commodityId: string, quantity: number): Promise<TradeTransactionResult> {
    if (!this.remote) return this.sell(islandId, commodityId, quantity);
    return this.transactRemote('sell', islandId, commodityId, quantity);
  }

  /**
   * ส่ง intent ให้ Server ตัดสิน แล้ว sync ผลจริงกลับ:
   * - เหรียญ: reconcile ให้เท่ากับยอด canonical ที่ Server ตอบเสมอ รวม idempotent replay
   * - cargo: แทนที่ทั้งชุดด้วย canonical จาก player_cargo
   * - สต็อกเมือง: Server หักแล้ว mirror ฝั่งนี้ตามมากับ economy poll รอบถัดไป
   * ปฏิเสธ/เน็ตล่ม = ไม่แตะสถานะ local ใด ๆ (ห้าม fork ยอดเงินกับ Server)
   */
  private async transactRemote(
    action: 'buy' | 'sell',
    islandId: IslandId,
    commodityId: string,
    quantity: number,
  ): Promise<TradeTransactionResult> {
    const commodity = getCommodity(commodityId);
    if (!commodity) return this.emit({ ok: false, message: 'ไม่พบสินค้า' });
    const qty = Math.max(1, Math.floor(quantity));
    const expected = action === 'buy'
      ? this.resolveBuyPrice(islandId, commodityId, qty)
      : this.resolveSellPrice(islandId, commodityId, qty);

    try {
      // Boat selection determines canonical cargo capacity. Flush its pending save before
      // asking the trade authority, otherwise an immediate purchase can see the old boat.
      await this.storage.flush?.();
      const response = await this.remote!.execute({
        action,
        islandId,
        commodityId,
        quantity: qty,
        expectedUnitPrice: expected ?? undefined,
      });
      this.reconcileWallet(response.coins);
      this.cargo.slots = response.cargo.map((slot) => ({
        commodityId: slot.commodityId,
        quantity: slot.quantity,
      }));
      this.saveCargo();
      const message = action === 'buy'
        ? `ซื้อ ${commodity.nameTh} x${qty} (${response.total} Beli)`
        : `ขาย ${commodity.nameTh} x${qty} ได้ ${response.total} Beli${response.fee > 0 ? ` (ค่าธรรมเนียม ${response.fee})` : ''}`;
      return this.emit({
        ok: true,
        message,
        coinsDelta: action === 'buy' ? -response.total : response.total,
        commodityId,
        quantityDelta: action === 'buy' ? qty : -qty,
        islandId,
        action,
      });
    } catch (error) {
      if (error instanceof RemoteTradeError) {
        return this.emit({ ok: false, message: rejectMessageTh(error) });
      }
      return this.emit({ ok: false, message: 'เชื่อมต่อ Server ไม่ได้ ลองใหม่อีกครั้ง' });
    }
  }

  /** ปรับ wallet mirror ได้ทั้งขึ้นและลง ห้ามใช้ transaction delta เพราะอาจเป็น replay */
  private reconcileWallet(canonicalCoins: number): void {
    const target = Math.max(0, Math.floor(canonicalCoins));
    const difference = target - this.wallet.coins;
    if (difference > 0) {
      this.wallet.addCoins(difference, 'trade:server-reconcile');
    } else if (difference < 0) {
      this.wallet.spendCoins(-difference, 'trade:server-reconcile');
    }
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
    return cargoFits(this.boatId, this.cargo.slots, commodityId, quantity);
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

/** แปลโค้ดปฏิเสธจาก Server เป็นข้อความผู้เล่น */
function rejectMessageTh(error: RemoteTradeError): string {
  switch (error.code) {
    case 'INSUFFICIENT_STOCK': return 'สต็อกของเมืองไม่พอ (ราคา/สต็อกเป็นของ Server แล้ว)';
    case 'INSUFFICIENT_COINS': return 'เหรียญบนบัญชี Server ไม่พอ';
    case 'INSUFFICIENT_CARGO': return 'สินค้าใน cargo บน Server ไม่พอ';
    case 'CARGO_FULL': return 'Cargo เต็มหรือน้ำหนักเกิน';
    case 'PRICE_MOVED': return 'ราคาขยับไปแล้ว กดยืนยันใหม่ด้วยราคาปัจจุบัน';
    case 'MARKET_UNAVAILABLE': return 'ตลาดนี้ไม่ซื้อขายสินค้านี้';
    case 'ECONOMY_NOT_READY': return 'Server เศรษฐกิจยังไม่พร้อม ลองใหม่สักครู่';
    case 'NETWORK': return error.message;
    default: return `Server ปฏิเสธ: ${error.message}`;
  }
}
