import { describe, expect, it } from 'vitest';
import { SKILL_MASTERY_REQUIRED, SKILL_RESOURCE_CATALOG } from './skillResources.js';

describe('generated skill resource catalog', () => {
  it('keeps representative resource and mastery records from every original category', () => {
    expect(Object.keys(SKILL_RESOURCE_CATALOG)).toHaveLength(431);
    expect(Object.keys(SKILL_MASTERY_REQUIRED)).toHaveLength(414);
    for (const id of ['phoenix-moveset-v1-z', 'bisento-v1-z', 'acidum-rifle-z', 'combat-z']) {
      expect(SKILL_RESOURCE_CATALOG[id]).toMatchObject({ id, mpCost: expect.any(Number), cooldownMs: expect.any(Number) });
      expect(SKILL_MASTERY_REQUIRED[id]).toEqual(expect.any(Number));
    }
  });
});
