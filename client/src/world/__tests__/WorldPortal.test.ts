import { describe, expect, it } from 'vitest';
import type { SaveData } from '../../save/SaveSystem';
import {
  LIVING_WORLD_PORTAL,
  POCKET_MONSTER_WORLD_PORTAL,
  WorldPortalEntryGate,
  isInsideWorldPortal,
  resolveSafePortalArrival,
} from '../WorldPortal';

const savedAt = (x: number, z: number): SaveData => ({
  x,
  y: 0,
  z,
  heading: 0,
  cameraYaw: 0,
});

describe('WorldPortalEntryGate', () => {
  it('does not trigger when the game boots inside a portal', () => {
    const gate = new WorldPortalEntryGate();

    expect(gate.update(true)).toBe(false);
    expect(gate.update(true)).toBe(false);
  });

  it('rearms only after leaving, then triggers once on re-entry', () => {
    const gate = new WorldPortalEntryGate();

    expect(gate.update(true)).toBe(false);
    expect(gate.update(false)).toBe(false);
    expect(gate.update(true)).toBe(true);
    expect(gate.update(true)).toBe(false);
  });

  it('triggers normally after first observing the player outside', () => {
    const gate = new WorldPortalEntryGate();

    expect(gate.update(false)).toBe(false);
    expect(gate.update(true)).toBe(true);
  });
});

describe('resolveSafePortalArrival', () => {
  it.each([
    POCKET_MONSTER_WORLD_PORTAL,
    LIVING_WORLD_PORTAL,
  ])('moves a saved position out of $id', (portal) => {
    const saved = savedAt(portal.x, portal.z);

    const resolved = resolveSafePortalArrival(saved);

    expect(resolved).not.toBe(saved);
    expect(resolved).not.toBeNull();
    if (!resolved) throw new Error('expected a safe arrival save');
    expect(resolved.x).toBe(portal.safeArrival.x);
    expect(resolved.z).toBe(portal.safeArrival.z);
    expect(resolved.heading).toBe(portal.safeArrival.heading);
    expect(isInsideWorldPortal(resolved, POCKET_MONSTER_WORLD_PORTAL)).toBe(false);
    expect(isInsideWorldPortal(resolved, LIVING_WORLD_PORTAL)).toBe(false);
  });

  it('leaves a saved position outside all portals unchanged', () => {
    const saved = savedAt(0, 0);

    expect(resolveSafePortalArrival(saved)).toBe(saved);
  });

  it('preserves the absence of a save', () => {
    expect(resolveSafePortalArrival(null)).toBeNull();
  });
});
