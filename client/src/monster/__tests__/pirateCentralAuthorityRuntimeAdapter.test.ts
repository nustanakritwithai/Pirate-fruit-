import { describe, expect, it } from 'vitest';
import { PirateCentralAuthorityRuntimeAdapter } from '../PirateCentralAuthorityRuntimeAdapter';

const capability = (overrides: Record<string, unknown> = {}) => ({
  contract: 'pirate-central-spatial/1', schemaVersion: 1,
  contentRevision: 'pirate-monster-catalog-2026-09-07-ai-v2-transport-v2',
  contentHash: 'fnv1a-236acf41',
  manifestSha256: '7D0B9E054B4D9F7669EC0EB34E4F93EE3ADF46E655E4FC7D30EFBBE8C4DD83A0',
  vectorsSha256: 'A3571B1D11E8EBFF68F9B1A027EF847E74D33B93B861D083D450910ADB4B4DF7',
  transportZone: 'pirate-fruit', generation: 1, ...overrides,
});

describe('PirateCentralAuthorityRuntimeAdapter', () => {
  it('enables only for the exact central contract and transport zone', () => {
    const adapter = new PirateCentralAuthorityRuntimeAdapter();
    expect(adapter.update(capability(), 'pirate-fruit')).toBe(true);
    expect(adapter.active).toBe(true);
    expect(adapter.sessionKey).toBe('pirate-fruit:1:7D0B9E054B4D9F7669EC0EB34E4F93EE3ADF46E655E4FC7D30EFBBE8C4DD83A0:A3571B1D11E8EBFF68F9B1A027EF847E74D33B93B861D083D450910ADB4B4DF7');
    expect(adapter.accepts('pirate-fruit')).toBe(true);
    expect(adapter.update(capability({ contentHash: 'fnv1a-bad' }), 'pirate-fruit')).toBe(false);
    expect(adapter.active).toBe(false);
    expect(adapter.update(capability({ manifestSha256: 'bad' }), 'pirate-fruit')).toBe(false);
    expect(adapter.update(capability({ vectorsSha256: 'bad' }), 'pirate-fruit')).toBe(false);
    expect(adapter.update({ ...capability(), manifestSha256: undefined }, 'pirate-fruit')).toBe(false);
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
    expect(adapter.sessionKey).toBeNull();
    expect(adapter.accepts('pirate-fruit')).toBe(false);
    expect(adapter.update(capability({ generation: 7 }), 'pirate-fruit')).toBe(true);
  });
});

