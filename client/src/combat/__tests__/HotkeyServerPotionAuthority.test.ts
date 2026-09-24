import { describe, expect, it, vi } from 'vitest';
import { HotkeyManager } from '../HotkeyManager';

const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));
function setup(server: boolean, request?: (id: string) => Promise<boolean>, slot = 2) {
  const controller = { hp: 50, hpMax: 100, mp: 20, mpMax: 100 };
  const ids = ['potion-hp', 'potion-mp'];
  const inventory = { quickslots: ids, getQuickslot: (index: number) => ids[index],
    getConsumableCount: () => 2, useConsumable: vi.fn(() => true) };
  const input = { consumePotion: vi.fn(() => slot) };
  const touch = { setPotionSlots: vi.fn(), notify: vi.fn() };
  const hotkeys = new HotkeyManager(input as never, controller as never,
    inventory as never, touch as never, true, () => 'idle', () => server, request);
  return { hotkeys, controller, inventory, input, touch };
}

describe('server potion single writer', () => {
  for (const slot of [1, 2]) {
    for (const accepted of [true, false]) {
      it(`keeps slot ${slot} local vitals and inventory untouched after ACK ${accepted}`, async () => {
        const request = vi.fn(async () => accepted);
        const { hotkeys, controller, inventory } = setup(true, request, slot);
        hotkeys.update(0.016);
        await flush();
        expect(request).toHaveBeenCalledWith(slot === 1 ? 'potion-hp' : 'potion-mp');
        expect(inventory.useConsumable).not.toHaveBeenCalled();
        expect(controller).toEqual({ hp: 50, hpMax: 100, mp: 20, mpMax: 100 });
      });
    }
  }
  it('does not fall back to local MP when the request fails or is unavailable', async () => {
    for (const request of [undefined, async () => { throw new Error('offline'); }]) {
      const { hotkeys, controller, inventory } = setup(true, request);
      hotkeys.update(0.016);
      await flush();
      expect(controller.mp).toBe(20);
      expect(inventory.useConsumable).not.toHaveBeenCalled();
    }
  });
  it('allows only one request while the server ACK is pending', async () => {
    let resolve!: (accepted: boolean) => void;
    const request = vi.fn(() => new Promise<boolean>(done => { resolve = done; }));
    const { hotkeys, inventory } = setup(true, request);
    hotkeys.update(0.016);
    hotkeys.update(0.016);
    expect(request).toHaveBeenCalledTimes(1);
    resolve(true);
    await flush();
    expect(inventory.useConsumable).not.toHaveBeenCalled();
  });
  it('preserves offline MP potion behavior', async () => {
    const request = vi.fn(async () => true);
    const { hotkeys, controller, inventory } = setup(false, request);
    hotkeys.update(0.016);
    await flush();
    expect(request).not.toHaveBeenCalled();
    expect(inventory.useConsumable).toHaveBeenCalledWith('potion-mp');
    expect(controller.mp).toBeGreaterThan(20);
  });
});
