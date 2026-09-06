import { describe, expect, it } from 'vitest';
import fixture from './fixtures/player-presentation.json';
import { sanitizePresentation, sanitizeProjectile, sanitizeVisual, sanitizeVisualEvent } from '../PresentationProtocol';

type FixtureCase = { name: string; input: unknown; expected?: unknown; reject?: boolean };

describe('canonical player presentation protocol', () => {
  it('matches all 40 canonical fixture cases exactly', () => {
    const groups: Array<[string, FixtureCase[], (input: unknown) => unknown]> = [
      ['eventCases', fixture.eventCases as FixtureCase[], sanitizeVisualEvent],
      ['presentationCases', fixture.presentationCases as FixtureCase[], sanitizePresentation],
      ['projectileCases', fixture.projectileCases as FixtureCase[], sanitizeProjectile],
      ['visualCases', fixture.visualCases as FixtureCase[], (input) => sanitizeVisual(input)],
    ];
    let count = 0;
    for (const [, cases, sanitize] of groups) {
      for (const testCase of cases) {
        const actual = sanitize(testCase.input);
        const expected = testCase.reject ? null : (Object.prototype.hasOwnProperty.call(testCase, 'expected') ? testCase.expected : testCase.input);
        expect(actual, testCase.name).toEqual(expected);
        count += 1;
      }
    }
    expect(count).toBe(40);
  });

  it('keeps 512 snapshot events while rejecting a 33-event ingress frame', () => {
    const event = { sequence: 1, kind: 'hit-spark', ageMs: 0, position: { x: 0, y: 0, z: 0 }, color: 1 };
    const snapshot = { schemaVersion: 1, sessionId: 'fixture_session', stateSequence: 1, events: Array.from({ length: 512 }, (_, index) => ({ ...event, sequence: index + 1 })), projectiles: [] };
    expect(sanitizeVisual(snapshot)?.events).toHaveLength(512);
    expect(sanitizeVisual({ ...snapshot, events: snapshot.events.slice(0, 33) }, 32)).toBeNull();
    expect(sanitizeVisual({ ...snapshot, events: snapshot.events.slice(0, 32) }, 32)?.events).toHaveLength(32);
  });

  it('matches canonical numeric boundaries for projectile lifetime and end burst', () => {
    const projectile = { id: 'p1', position: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 1 }, velocity: { x: 0, y: 0, z: 1 }, color: 1, scale: 1, elapsed: 0, lifeFraction: 1, remainingMs: 1000 };
    expect(sanitizeProjectile({ ...projectile, remainingMs: 1000.5 })).toBeNull();
    expect(sanitizeVisualEvent({ sequence: 1, kind: 'projectile-end', ageMs: 0, position: { x: 0, y: 0, z: 0 }, projectileId: 'p1', color: 1, scale: 1, burstScale: 0 })).toMatchObject({ burstScale: 0 });
    expect(sanitizeVisualEvent({ sequence: 1, kind: 'hit-spark', ageMs: 0, position: { x: 0, y: 0, z: 0 }, color: 1, assetId: 'fireball' })).toBeNull();
  });
});
