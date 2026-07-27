import { describe, expect, it } from 'vitest';
import { interpolateAuthoritativeBoatPose } from '../BoatManager';
import { resolveNavalAuthorityPlan } from '../NavalCombat';

describe('authoritative player boat with local pirate naval world', () => {
  it('keeps pirate ships rendered and simulated when player boats use Server authority', () => {
    expect(resolveNavalAuthorityPlan(true)).toEqual({
      simulatePirateShips: true,
      renderPirateShips: true,
      allowLocalPirateDamage: true,
      mirrorPlayerBroadside: true,
    });
  });

  it('interpolates ordinary Server ticks instead of snapping the player boat', () => {
    const next = interpolateAuthoritativeBoatPose(
      { x: 0, z: 0, heading: 0, speed: 0 },
      { x: 0, z: 2, heading: 0.2, speed: 8 },
      1 / 60,
      0.1,
    );

    expect(next.z).toBeGreaterThan(0);
    expect(next.z).toBeLessThan(2.8);
    expect(next.heading).toBeGreaterThan(0);
    expect(next.heading).toBeLessThan(0.2);
    expect(next.speed).toBeGreaterThan(0);
    expect(next.speed).toBeLessThan(8);
  });
});
