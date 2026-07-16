import { describe, expect, it, beforeEach, vi } from 'vitest';
import { isTouchDevice, loadTouchPanelVisible, saveTouchPanelVisible } from '../device';

describe('device touch panel', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    });
    vi.stubGlobal('navigator', { maxTouchPoints: 0 });
    vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('window', {});
  });

  it('defaults touch panel off on non-touch desktop', () => {
    expect(loadTouchPanelVisible()).toBe(false);
  });

  it('?touch=1 forces panel on', () => {
    vi.stubGlobal('location', { search: '?touch=1' });
    expect(isTouchDevice()).toBe(true);
    expect(loadTouchPanelVisible()).toBe(true);
  });

  it('persists panel preference', () => {
    saveTouchPanelVisible(true);
    expect(loadTouchPanelVisible()).toBe(true);
    saveTouchPanelVisible(false);
    expect(loadTouchPanelVisible()).toBe(false);
  });
});
