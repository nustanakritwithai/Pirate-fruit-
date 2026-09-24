import { describe, expect, it } from 'vitest';
import { PirateVitalsAuthority, PIRATE_VITALS_CONTRACT } from '../PirateVitalsAuthority';

const snapshot = (revision: number, overrides: Record<string, unknown> = {}) => ({
  contract: PIRATE_VITALS_CONTRACT, revision, serverTimeMs: revision * 100, hp: 80, maxHp: 100, guard: 50, guardMax: 100,
  guardBroken: false, hitstunUntil: 0, energy: 90, maxEnergy: 100, mp: 40, maxMp: 100, dead: false, ...overrides,
});

describe('Pirate vitals authority receiver', () => {
  it('claims on a valid monotonic snapshot and rejects stale packets', () => {
    const authority = new PirateVitalsAuthority();
    expect(authority.apply(snapshot(1))).toBe(true);
    expect(authority.active).toBe(true);
    expect(authority.apply(snapshot(1, { hp: 1 }))).toBe(false);
    expect(authority.snapshot?.hp).toBe(80);
  });

  it('fails closed after claim when a packet is malformed', () => {
    const authority = new PirateVitalsAuthority();
    expect(authority.apply(snapshot(4))).toBe(true);
    expect(authority.apply({ ...snapshot(5), hp: 101 })).toBe(false);
    expect(authority.active).toBe(true);
    expect(authority.revision).toBe(4);
  });

  it('requires respawn revision to be within the enclosing snapshot history', () => {
    const authority = new PirateVitalsAuthority();
    expect(authority.apply(snapshot(2, { hp: 0, dead: true, respawn: { spawnId: 'starter-village', islandId: 'starter-island', x: 0, y: 0, z: 0, heading: 0, atRevision: 3 } }))).toBe(false);
    expect(authority.active).toBe(false);
  });
});
