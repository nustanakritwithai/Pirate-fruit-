import { LivingTradeSimulator } from '../../client/src/trade/living/LivingTradeSimulator';
import {
  LIVING_ECONOMY_SAVE_VERSION,
  createFreshWorld,
  parseEconomyDocument,
  serializeEconomyState,
} from '../../client/src/trade/living/LivingTradePersistence';
import { isLivingCommodity } from '../../client/src/trade/living/LivingTradeConfig';
import {
  cargoFits,
  resolveBuyUnitPrice,
  resolveSellUnitPrice,
} from '../../client/src/trade/TradePricing';
import type { IslandId } from '../../client/src/island/IslandTypes';

export interface BundledEconomySnapshot {
  tick: number;
  documentVersion: number;
  document: Record<string, unknown>;
}

export interface BundledCargoSlot {
  commodityId: string;
  quantity: number;
}

export interface BundledBuyQuote {
  unitPrice: number;
  /** จำนวนที่เมืองยอมขาย (null = สินค้า static ไม่จำกัดด้วยคลังเมือง) */
  tradableStock: number | null;
}

export interface BundledSellQuote {
  unitPrice: number;
  /** สัดส่วนค่าธรรมเนียมขายของเกาะ (0..1) */
  feeRate: number;
}

function decode(document: unknown) {
  if (document === null || document === undefined) return null;
  try {
    const raw = typeof document === 'string' ? document : JSON.stringify(document);
    return parseEconomyDocument(raw);
  } catch {
    return null;
  }
}

/**
 * The Server bundles this entry from the existing gameplay simulation source.
 * That keeps formula/config drift impossible while S7 moves the clock and storage
 * authority to PostgreSQL. Rendering and browser-only UI modules are not bundled.
 */
export function createEconomyEngine(initialDocument?: unknown) {
  const initialWorld = decode(initialDocument) ?? createFreshWorld();
  const simulator = new LivingTradeSimulator({
    initialWorld,
    persist: () => undefined,
  });

  return {
    get tick(): number {
      return simulator.state.tick;
    },
    advance(): void {
      simulator.tick();
    },
    snapshot(): BundledEconomySnapshot {
      const serialized = serializeEconomyState(simulator.state);
      return {
        tick: simulator.state.tick,
        documentVersion: LIVING_ECONOMY_SAVE_VERSION,
        document: JSON.parse(serialized) as Record<string, unknown>,
      };
    },

    // ---------- S8 Trade Authority: quote/apply ใช้สูตรกลางตัวเดียวกับ browser ----------

    /** ใบเสนอราคาซื้อจากสถานะโลกจริงบน Server (null = ตลาดนี้ไม่ขายสินค้านี้) */
    quoteBuy(islandId: string, commodityId: string, quantity: number): BundledBuyQuote | null {
      const island = islandId as IslandId;
      const unitPrice = resolveBuyUnitPrice(simulator, island, commodityId, quantity);
      if (unitPrice == null) return null;
      return {
        unitPrice,
        tradableStock: simulator.getTradableStock(island, commodityId),
      };
    },

    /** ใบเสนอราคาขาย (null = ตลาดนี้ไม่รับซื้อ) */
    quoteSell(islandId: string, commodityId: string, quantity: number): BundledSellQuote | null {
      const island = islandId as IslandId;
      const unitPrice = resolveSellUnitPrice(simulator, island, commodityId, quantity);
      if (unitPrice == null) return null;
      return {
        unitPrice,
        feeRate: simulator.getFeeModifierForIsland(island),
      };
    },

    /** หักคลังเมืองหลังธุรกรรมซื้อ commit แล้ว (เฉพาะสินค้า living) */
    applyBuy(islandId: string, commodityId: string, quantity: number, unitPrice: number): void {
      if (!isLivingCommodity(commodityId)) return;
      simulator.applyPlayerBuy(islandId as IslandId, commodityId, quantity, unitPrice);
    },

    /** เพิ่มคลังเมืองหลังธุรกรรมขาย commit แล้ว */
    applySell(islandId: string, commodityId: string, quantity: number, unitPrice: number): void {
      if (!isLivingCommodity(commodityId)) return;
      simulator.applyPlayerSell(islandId as IslandId, commodityId, quantity, unitPrice);
    },

    /** เช็คความจุ cargo ของเรือด้วย databook เดียวกับ browser (pure) */
    cargoFits(
      boatId: string,
      slots: readonly BundledCargoSlot[],
      commodityId: string,
      quantity: number,
    ): boolean {
      return cargoFits(boatId, slots, commodityId, quantity);
    },
  };
}
