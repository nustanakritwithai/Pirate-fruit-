import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BOSS_SPAWNS, MONSTER_CAMPS } from '../MonsterData';
import {
  PIRATE_CENTRAL_CONTENT_MANIFEST,
  PIRATE_CENTRAL_SPATIAL_MANIFEST,
  PIRATE_CENTRAL_SPATIAL_MANIFEST_JSON,
  PIRATE_CENTRAL_SPATIAL_SCHEMA_VECTOR,
  PIRATE_CENTRAL_SPATIAL_VECTORS,
  PIRATE_CENTRAL_SPATIAL_VECTORS_JSON,
  PIRATE_MONSTER_INTENT_LIMITS,
  isPirateCentralSpatialManifest,
} from '../PirateCentralContentManifest';

const ARTIFACT_SHA256 = '048B457B70C86527C17DE05EBC63780EF748F1DA6E7D2AE2019E8E0597D39CFC';

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

  it('exports the exact pirate-central-spatial/1 JSON shape deterministically', () => {
    const parsed: unknown = JSON.parse(PIRATE_CENTRAL_SPATIAL_MANIFEST_JSON);
    expect(isPirateCentralSpatialManifest(parsed)).toBe(true);
    expect(Object.keys(parsed as object)).toEqual([
      'schema', 'contentRevision', 'zones', 'mapId', 'collisionProfile', 'aiProfile', 'spawns', 'contentHash',
    ]);
    expect(PIRATE_CENTRAL_SPATIAL_MANIFEST.schema).toBe(PIRATE_CENTRAL_SPATIAL_SCHEMA_VECTOR.schema);
    expect(PIRATE_CENTRAL_SPATIAL_MANIFEST.mapId).toBe(PIRATE_CENTRAL_SPATIAL_SCHEMA_VECTOR.mapId);
    expect(PIRATE_CENTRAL_SPATIAL_MANIFEST.spawns).toHaveLength(MONSTER_CAMPS.length + BOSS_SPAWNS.length);
    expect(JSON.stringify(PIRATE_CENTRAL_SPATIAL_MANIFEST)).toBe(PIRATE_CENTRAL_SPATIAL_MANIFEST_JSON);
    expect(PIRATE_CENTRAL_SPATIAL_MANIFEST.collisionProfile.groundInput).toBe('worldHeightAt');
    expect(PIRATE_CENTRAL_SPATIAL_MANIFEST.aiProfile.chaseLeashMultiplier).toBe(1.6);
  });

  it('keeps the committed artifact byte-identical to the source export', () => {
    const artifact = readFileSync(resolve(__dirname, '../pirate-central-spatial.manifest.json'), 'utf8');
    expect(artifact).toBe(PIRATE_CENTRAL_SPATIAL_MANIFEST_JSON);
    expect(createHash('sha256').update(artifact).digest('hex').toUpperCase()).toBe(ARTIFACT_SHA256);
    const parsed: unknown = JSON.parse(artifact);
    expect(parsed).toEqual(PIRATE_CENTRAL_SPATIAL_MANIFEST);
    expect((parsed as { schema: string }).schema).toBe('pirate-central-spatial/1');
    expect((parsed as { contentRevision: string }).contentRevision).toBe('pirate-monster-catalog-2026-09-07');
    expect((parsed as { contentHash: string }).contentHash).toBe(PIRATE_CENTRAL_SPATIAL_MANIFEST.contentHash);
  });

  it('keeps real spatial behavior vectors byte-identical and free of combat fields', () => {
    const vectors = readFileSync(resolve(__dirname, '../pirate-central-spatial.vectors.json'), 'utf8');
    expect(vectors).toBe(PIRATE_CENTRAL_SPATIAL_VECTORS_JSON);
    expect(createHash('sha256').update(vectors).digest('hex').toUpperCase()).toBe('A3571B1D11E8EBFF68F9B1A027EF847E74D33B93B861D083D450910ADB4B4DF7');
    expect(PIRATE_CENTRAL_SPATIAL_VECTORS.ground.spawnSampling.attempts).toBe(24);
    expect(PIRATE_CENTRAL_SPATIAL_VECTORS.behavior.leash.distance).toBe('min(type.aggroRange*1.15,15)');
    expect(vectors).not.toMatch(/maxHp|damage|target/);
  });
});
