import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { controlSurfaceLayout, isTouchDevice } from '../device';

describe('device control surface', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { maxTouchPoints: 0 });
    vi.stubGlobal('location', { search: '' });
    vi.stubGlobal('window', {});
  });

  afterEach(() => vi.unstubAllGlobals());

  it('uses the desktop combat HUD on a non-touch computer', () => {
    expect(isTouchDevice()).toBe(false);
    expect(controlSurfaceLayout()).toBe('desktop');
  });

  it('?touch=1 keeps the full mobile control surface available for testing', () => {
    vi.stubGlobal('location', { search: '?touch=1' });
    expect(isTouchDevice()).toBe(true);
    expect(controlSurfaceLayout()).toBe('touch');
  });

  it('?notouch=1 forces the desktop HUD on hybrid computers', () => {
    vi.stubGlobal('navigator', { maxTouchPoints: 10 });
    vi.stubGlobal('window', { ontouchstart: null });
    vi.stubGlobal('location', { search: '?notouch=1' });
    expect(isTouchDevice()).toBe(false);
    expect(controlSurfaceLayout()).toBe('desktop');
  });

  it('prefers the desktop HUD when a hybrid computer has a fine pointer and hover', () => {
    vi.stubGlobal('navigator', { maxTouchPoints: 10 });
    vi.stubGlobal('window', { ontouchstart: null });
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(pointer: fine)' || query === '(hover: hover)',
    }));
    expect(isTouchDevice()).toBe(true);
    expect(controlSurfaceLayout()).toBe('desktop');
  });
});
