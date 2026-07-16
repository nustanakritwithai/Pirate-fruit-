interface Tickable {
  tick(): void;
}

/**
 * Long economy simulations are intentionally synchronous at the domain layer.
 * Tests yield between small batches so Vitest can deliver worker heartbeats.
 */
export async function yieldToTestRunner(iteration: number, batchSize = 25): Promise<void> {
  if ((iteration + 1) % batchSize !== 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

export async function runTicksCooperatively(
  tickable: Tickable,
  count: number,
  batchSize = 25,
): Promise<void> {
  for (let i = 0; i < count; i++) {
    tickable.tick();
    await yieldToTestRunner(i, batchSize);
  }
}
