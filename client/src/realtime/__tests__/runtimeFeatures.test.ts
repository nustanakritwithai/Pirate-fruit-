import { describe, expect, it, vi } from 'vitest';
import { fetchRuntimeFeatures, resolveSharedMonsterMode } from '../RuntimeFeatures';

describe('runtime feature handshake', () => {
  it('keeps local monsters when the live Server explicitly has shared monsters disabled', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      features: { boatWorld: true, sharedWorldMonsters: false },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const runtime = await fetchRuntimeFeatures('https://server.example/', fetcher);

    expect(resolveSharedMonsterMode(true, runtime)).toBe(false);
    expect(fetcher).toHaveBeenCalledWith(
      'https://server.example/version',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('enables shared monsters only when both the build and live Server enable them', async () => {
    const runtime = await fetchRuntimeFeatures(
      'https://server.example',
      async () => new Response(JSON.stringify({
        features: { boatWorld: true, sharedWorldMonsters: true },
      }), { status: 200 }),
    );

    expect(resolveSharedMonsterMode(true, runtime)).toBe(true);
    expect(resolveSharedMonsterMode(false, runtime)).toBe(false);
  });

  it('retains the build choice when the feature probe is temporarily unreachable', async () => {
    const runtime = await fetchRuntimeFeatures('https://server.example', async () => {
      throw new Error('offline');
    });

    expect(runtime).toBeNull();
    expect(resolveSharedMonsterMode(true, runtime)).toBe(true);
  });
});
