import { describe, expect, it } from 'vitest';
import { BOSS_SPAWNS, MONSTER_CAMPS } from '../MonsterData';
import { PIRATE_CENTRAL_CONTENT_MANIFEST, PIRATE_MONSTER_INTENT_LIMITS } from '../PirateCentralContentManifest';

describe('Pirate central content manifest', () => {
  it('is deterministic and maps the real catalog/spawn source without authority fields', () => {
    const manifest = PIRATE_CENTRAL_CONTENT_MANIFEST;
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.contentHash).toMatch(/^fnv1a-[0-9a-f]{8}$/);
    expect(manifest.spawn.camps).toHaveLength(MONSTER_CAMPS.length);
    expect(manifest.spawn.bosses).toHaveLength(BOSS_SPAWNS.length);
    expect(manifest.monsterTypes.every((type) => !('maxHp' in type) && !('damage' in type))).toBe(true);
    expect(manifest.collision).toEqual({
      coordinateFrame: 'x-z', groundInput: 'worldHeightAt', minimumWalkableGround: 0.6, safeZoneRule: 'isInSafeZone',
    });
    expect(manifest.ai).toMatchObject({ fixedTickHz: 60, chaseLeashMultiplier: 1.6, wanderSpeedMultiplier: 0.4, returnSpeedMultiplier: 0.5 });
  });

  it('publishes bounded intent limits with no pose or velocity channel', () => {
    expect(PIRATE_MONSTER_INTENT_LIMITS).toEqual({ maxBatch: 32, maxRange: 10_000, maxArea: 10_000, maxSkillIdLength: 80 });
  });
});
