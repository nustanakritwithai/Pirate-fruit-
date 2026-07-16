import { describe, expect, it } from 'vitest';
import { loadBundledEconomyEngine } from './economyEngine.js';

describe('bundled living-economy kernel', () => {
  it('reuses the gameplay formulas and rejects the legacy S4 placeholder document', async () => {
    const engine = await loadBundledEconomyEngine({
      schemaVersion: 2,
      tick: 0,
      islands: {},
      generatedBy: 's4-seed',
    });
    const initial = engine.snapshot();
    const world = initial.document.world as { tick: number; cells: unknown[] };
    expect(initial.tick).toBe(0);
    expect(world.cells.length).toBeGreaterThan(1);

    engine.advance();
    const advanced = engine.snapshot();
    expect(advanced.tick).toBe(1);
    expect((advanced.document.world as { tick: number }).tick).toBe(1);
  });
});
