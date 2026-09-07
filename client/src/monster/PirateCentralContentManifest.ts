import { BOSS_SPAWNS, MONSTER_CAMPS, MONSTER_TYPES } from './MonsterData';

/** Versioned, presentation/AI input manifest. It contains no runtime player pose,
 * velocity, HP result, damage result, target, or invented map coordinates. */
export interface PirateCentralMonsterType {
  id: string;
  kind: 'crab' | 'grunt' | 'boss';
  level: number;
  moveSpeed: number;
  aggroRange: number;
  attackRange: number;
  attackCooldown: number;
  heavyAttack?: {
    everyNth: number;
    multiplier: number;
    telegraph: number;
    knockback: number;
    tags: readonly string[];
  };
}

export interface PirateCentralCampRule {
  id: string;
  zone: string;
  monsterType: string;
  center: { x: number; z: number };
  radius: number;
  count: number;
  recommendedLevel: number;
}

export interface PirateCentralBossRule {
  zone: string;
  monsterType: string;
  center: { x: number; z: number };
}

export interface PirateCentralContentManifest {
  schemaVersion: 1;
  contentRevision: string;
  contentHash: string;
  zones: readonly string[];
  collision: {
    coordinateFrame: 'x-z';
    groundInput: 'worldHeightAt';
    minimumWalkableGround: number;
    safeZoneRule: 'isInSafeZone';
  };
  ai: {
    fixedTickHz: number;
    chaseLeashMultiplier: number;
    wanderTimerSeconds: { min: number; randomSpan: number };
    wanderSpeedMultiplier: number;
    returnSpeedMultiplier: number;
  };
  spawn: {
    ambientRespawnSeconds: number;
    bossRespawnSeconds: number;
    camps: readonly PirateCentralCampRule[];
    bosses: readonly PirateCentralBossRule[];
  };
  monsterTypes: readonly PirateCentralMonsterType[];
}

const stableTypes = Object.values(MONSTER_TYPES).map((type) => ({
  id: type.id,
  kind: type.kind,
  level: type.level,
  moveSpeed: type.moveSpeed,
  aggroRange: type.aggroRange,
  attackRange: type.attackRange,
  attackCooldown: type.attackCooldown,
  ...(type.heavyAttack ? { heavyAttack: { ...type.heavyAttack, tags: [...type.heavyAttack.tags] } } : {}),
}));

const camps = MONSTER_CAMPS.map((camp) => ({
  id: camp.id,
  zone: camp.islandId,
  monsterType: camp.typeId,
  center: { x: camp.x, z: camp.z },
  radius: camp.radius,
  count: camp.count,
  recommendedLevel: camp.recommendedLevel,
}));

const bosses = BOSS_SPAWNS.map((spawn) => ({
  zone: spawn.islandId,
  monsterType: spawn.typeId,
  center: { x: spawn.x, z: spawn.z },
}));

const zones = [...new Set([...camps.map((camp) => camp.zone), ...bosses.map((boss) => boss.zone)])].sort();

const manifestWithoutHash = {
  schemaVersion: 1 as const,
  contentRevision: 'pirate-monster-catalog-2026-09-07',
  zones,
  collision: {
    coordinateFrame: 'x-z' as const,
    groundInput: 'worldHeightAt' as const,
    minimumWalkableGround: 0.6,
    safeZoneRule: 'isInSafeZone' as const,
  },
  ai: {
    fixedTickHz: 60,
    chaseLeashMultiplier: 1.6,
    wanderTimerSeconds: { min: 1.5, randomSpan: 2.5 },
    wanderSpeedMultiplier: 0.4,
    returnSpeedMultiplier: 0.5,
  },
  spawn: { ambientRespawnSeconds: 12, bossRespawnSeconds: 40, camps, bosses },
  monsterTypes: stableTypes,
};

function fnv1a(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export const PIRATE_CENTRAL_CONTENT_MANIFEST: PirateCentralContentManifest = Object.freeze({
  ...manifestWithoutHash,
  contentHash: fnv1a(JSON.stringify(manifestWithoutHash)),
});

/** Bounded command schema consumed by the central engine; pose/velocity are absent by design. */
export const PIRATE_MONSTER_INTENT_LIMITS = Object.freeze({
  maxBatch: 32,
  maxRange: 10_000,
  maxArea: 10_000,
  maxSkillIdLength: 80,
});

/** Canonical wire shape consumed by the central spatial engine. */
export interface PirateCentralSpatialManifest {
  schema: 'pirate-central-spatial/1';
  contentRevision: string;
  contentHash: string;
  zones: readonly string[];
  mapId: 'pirate-fruit';
  collisionProfile: PirateCentralContentManifest['collision'];
  aiProfile: PirateCentralContentManifest['ai'];
  spawns: readonly (PirateCentralCampRule & { kind: 'camp' } | PirateCentralBossRule & { kind: 'boss'; id: string })[];
}

const spatialWithoutHash = {
  schema: 'pirate-central-spatial/1' as const,
  contentRevision: manifestWithoutHash.contentRevision,
  zones,
  mapId: 'pirate-fruit' as const,
  collisionProfile: manifestWithoutHash.collision,
  aiProfile: manifestWithoutHash.ai,
  spawns: [
    ...camps.map((camp) => ({ kind: 'camp' as const, ...camp })),
    ...bosses.map((boss, index) => ({ kind: 'boss' as const, id: `boss-${boss.zone}-${index + 1}`, ...boss })),
  ],
};

export const PIRATE_CENTRAL_SPATIAL_MANIFEST: PirateCentralSpatialManifest = Object.freeze({
  ...spatialWithoutHash,
  contentHash: fnv1a(JSON.stringify(spatialWithoutHash)),
});

/** Canonical bytes for server ingestion; key order is stable by construction. */
export const PIRATE_CENTRAL_SPATIAL_MANIFEST_JSON = JSON.stringify(PIRATE_CENTRAL_SPATIAL_MANIFEST);

export const PIRATE_CENTRAL_SPATIAL_SCHEMA_VECTOR = Object.freeze({
  requiredKeys: ['schema', 'contentRevision', 'contentHash', 'zones', 'mapId', 'collisionProfile', 'aiProfile', 'spawns'],
  schema: 'pirate-central-spatial/1',
  mapId: 'pirate-fruit',
});

export function isPirateCentralSpatialManifest(value: unknown): value is PirateCentralSpatialManifest {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PirateCentralSpatialManifest>;
  return candidate.schema === 'pirate-central-spatial/1'
    && candidate.mapId === 'pirate-fruit'
    && typeof candidate.contentRevision === 'string'
    && typeof candidate.contentHash === 'string'
    && Array.isArray(candidate.zones)
    && Array.isArray(candidate.spawns)
    && Boolean(candidate.collisionProfile)
    && Boolean(candidate.aiProfile);
}
