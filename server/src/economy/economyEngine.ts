export interface EconomyEngineSnapshot {
  tick: number;
  documentVersion: number;
  document: Record<string, unknown>;
}

export interface EconomyEngine {
  readonly tick: number;
  advance(): void;
  snapshot(): EconomyEngineSnapshot;
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
