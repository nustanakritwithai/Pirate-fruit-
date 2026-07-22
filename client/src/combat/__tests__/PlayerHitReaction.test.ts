import { describe, expect, it } from 'vitest';
import { canRegenerateHp, getRelativeHitAngle } from '../PlayerCombat';

describe('player hit reaction direction', () => {
  it('converts world-space attack sources into player-local angles', () => {
    expect(getRelativeHitAngle(0, 0, 0, 0, 4)).toBeCloseTo(0, 6);
    expect(getRelativeHitAngle(0, 0, 0, 4, 0)).toBeCloseTo(Math.PI / 2, 6);
    expect(getRelativeHitAngle(0, 0, 0, -4, 0)).toBeCloseTo(-Math.PI / 2, 6);
    expect(getRelativeHitAngle(0, 0, Math.PI / 2, 4, 0)).toBeCloseTo(0, 6);
  });

  it('uses a stable front reaction when source and player overlap', () => {
    expect(getRelativeHitAngle(3, -2, 1.7, 3, -2)).toBe(0);
  });
});

describe('authoritative combat regeneration gate', () => {
  it('blocks local HP regeneration throughout the Server PvP combat window', () => {
    expect(canRegenerateHp(99, 0.01, 40, 100, false)).toBe(false);
    expect(canRegenerateHp(99, 0, 40, 100, false)).toBe(true);
  });

  it('still requires a living, injured, on-foot player outside combat', () => {
    expect(canRegenerateHp(99, 0, 0, 100, false)).toBe(false);
    expect(canRegenerateHp(99, 0, 100, 100, false)).toBe(false);
    expect(canRegenerateHp(99, 0, 40, 100, true)).toBe(false);
  });
});
