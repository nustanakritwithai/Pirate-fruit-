import { describe, expect, it } from 'vitest';
import { PirateCentralAuthorityRuntimeAdapter } from '../PirateCentralAuthorityRuntimeAdapter';

const capability = (overrides: Record<string, unknown> = {}) => ({
  contract: 'pirate-central-spatial/1', schemaVersion: 1,
  contentRevision: 'pirate-monster-catalog-2026-09-07-ai-v2-transport-v2',
  contentHash: 'fnv1a-236acf41', transportZone: 'pirate-fruit', generation: 1, ...overrides,
});

describe('PirateCentralAuthorityRuntimeAdapter', () => {
  it('enables only for the exact central contract and transport zone', () => {
    const adapter = new PirateCentralAuthorityRuntimeAdapter();
    expect(adapter.update(capability(), 'pirate-fruit')).toBe(true);
    expect(adapter.active).toBe(true);
    expect(adapter.accepts('pirate-fruit')).toBe(true);
    expect(adapter.update(capability({ contentHash: 'fnv1a-bad' }), 'pirate-fruit')).toBe(false);
    expect(adapter.active).toBe(false);
    expect(adapter.update({ schema: 'pirate-central-authority/1', identity: 'pirate-central-spatial', zone: 'pirate-fruit', generation: 2 }, 'pirate-fruit')).toBe(false);
  });

  it('fails closed on mismatch, stale generation, reconnect and zone transition', () => {
    const adapter = new PirateCentralAuthorityRuntimeAdapter();
    expect(adapter.update(capability({ generation: 4 }), 'pirate-fruit')).toBe(true);
    expect(adapter.update(capability({ generation: 3 }), 'pirate-fruit')).toBe(false);
    expect(adapter.active).toBe(true);
    expect(adapter.update(capability({ generation: 5, transportZone: 'mist-jungle' }), 'pirate-fruit')).toBe(false);
    expect(adapter.active).toBe(false);
    adapter.update(capability({ generation: 6 }), 'pirate-fruit');
    for (const zone of ['starter-island', 'mist-jungle', 'sunscar-desert', 'azure-frost', 'tempest-sky', 'ember-volcano']) {
      expect(adapter.accepts(zone)).toBe(true);
    }
    adapter.reset();
    expect(adapter.active).toBe(false);
    expect(adapter.accepts('pirate-fruit')).toBe(false);
  });
});
