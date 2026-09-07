import { describe, expect, it } from 'vitest';
import { PirateCentralAuthorityRuntimeAdapter } from '../PirateCentralAuthorityRuntimeAdapter';

const capability = (overrides: Record<string, unknown> = {}) => ({
  schema: 'pirate-central-authority/1', identity: 'pirate-central-spatial', zone: 'pirate-fruit', generation: 1, ...overrides,
});

describe('PirateCentralAuthorityRuntimeAdapter', () => {
  it('enables only for exact identity and zone, then accepts central actors', () => {
    const adapter = new PirateCentralAuthorityRuntimeAdapter();
    expect(adapter.update(capability(), 'pirate-fruit')).toBe(true);
    expect(adapter.active).toBe(true);
    expect(adapter.accepts('pirate-fruit')).toBe(true);
    expect(adapter.update(capability({ identity: 'spoof' }), 'pirate-fruit')).toBe(false);
    expect(adapter.active).toBe(false);
  });

  it('fails closed on mismatch, stale generation, reconnect and zone transition', () => {
    const adapter = new PirateCentralAuthorityRuntimeAdapter();
    expect(adapter.update(capability({ generation: 4 }), 'pirate-fruit')).toBe(true);
    expect(adapter.update(capability({ generation: 3 }), 'pirate-fruit')).toBe(false);
    expect(adapter.active).toBe(true);
    expect(adapter.update(capability({ generation: 5, zone: 'mist-jungle' }), 'pirate-fruit')).toBe(false);
    expect(adapter.active).toBe(false);
    adapter.update(capability({ generation: 6 }), 'pirate-fruit');
    expect(adapter.accepts('mist-jungle')).toBe(true);
    adapter.reset();
    expect(adapter.active).toBe(false);
    expect(adapter.accepts('pirate-fruit')).toBe(false);
  });
});
