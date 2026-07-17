export interface EconomyEngineSnapshot {
  tick: number;
  documentVersion: number;
  document: Record<string, unknown>;
}

export interface EconomyCargoSlot {
  commodityId: string;
  quantity: number;
}

export interface EconomyBuyQuote {
  unitPrice: number;
  tradableStock: number | null;
}

export interface EconomySellQuote {
  unitPrice: number;
  feeRate: number;
}

export interface EconomyEngine {
  readonly tick: number;
  advance(): void;
  snapshot(): EconomyEngineSnapshot;
  // S8 Trade Authority — สูตรเดียวกับ browser ผ่าน bundle เดียวกัน
  quoteBuy(islandId: string, commodityId: string, quantity: number): EconomyBuyQuote | null;
  quoteSell(islandId: string, commodityId: string, quantity: number): EconomySellQuote | null;
  applyBuy(islandId: string, commodityId: string, quantity: number, unitPrice: number): void;
  applySell(islandId: string, commodityId: string, quantity: number, unitPrice: number): void;
  cargoFits(
    boatId: string,
    slots: readonly EconomyCargoSlot[],
    commodityId: string,
    quantity: number,
  ): boolean;
}

export type EconomyEngineFactory = (initialDocument?: unknown) => Promise<EconomyEngine>;

interface BundledEconomyModule {
  createEconomyEngine(initialDocument?: unknown): EconomyEngine;
}

let modulePromise: Promise<BundledEconomyModule> | null = null;

/** Load the build-time bundle of the existing gameplay simulation kernel. */
export async function loadBundledEconomyEngine(initialDocument?: unknown): Promise<EconomyEngine> {
  const moduleUrl = new URL('../../dist/economy-engine.js', import.meta.url);
  modulePromise ??= import(moduleUrl.href) as Promise<BundledEconomyModule>;
  const module = await modulePromise;
  return module.createEconomyEngine(initialDocument);
}
