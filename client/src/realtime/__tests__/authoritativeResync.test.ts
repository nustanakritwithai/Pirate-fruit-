import { describe, expect, it, vi } from 'vitest';
import { createAuthoritativeResyncHandler } from '../AuthoritativeResync';

describe('authoritative realtime resync', () => {
  it('refreshes economy, quest, progression, and save after a sequence gap', async () => {
    const economy = vi.fn();
    const quest = vi.fn(async () => true);
    const progression = vi.fn(async () => true);
    const save = vi.fn(async () => true);
    const resync = createAuthoritativeResyncHandler({
      refreshEconomy: economy,
      refreshQuest: quest,
      refreshProgression: progression,
      flushAndRecoverSave: save,
    });

    resync();
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(economy).toHaveBeenCalledOnce();
    expect(quest).toHaveBeenCalledOnce();
    expect(progression).toHaveBeenCalledOnce();
  });

  it('coalesces authority REST work while a previous resync is still running', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const economy = vi.fn();
    const quest = vi.fn(() => pending);
    const resync = createAuthoritativeResyncHandler({ refreshEconomy: economy, refreshQuest: quest });

    resync();
    resync();
    expect(economy).toHaveBeenCalledTimes(2);
    expect(quest).toHaveBeenCalledOnce();
    release();
    await pending;
  });
});
