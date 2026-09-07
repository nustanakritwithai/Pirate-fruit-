import { BOSS_SPAWNS, MONSTER_CAMPS, MONSTER_TYPES } from './MonsterData';
import { ISLANDS, worldHeightAt } from '../island/IslandRegistry';
import { WORLD_SAFE_ZONES, worldSafeZoneAt } from '@pirate-fruit/shared';

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

/** Deterministic spatial vectors copied from MonsterManager/World rules. */
export const PIRATE_CENTRAL_SPATIAL_VECTORS = Object.freeze({
  schema: 'pirate-central-spatial-vectors/1',
  sourceRevision: 'MonsterManager@3042e49',
  ground: {
    function: 'worldHeightAt',
    walkMinimum: 0.25,
    spawnAcceptance: 0.6,
    spawnSampling: { attempts: 24, radialDistribution: 'sqrt(random)*radius', fallback: 'center' },
    samples: [
      { input: { x: 0, z: 8 }, output: { height: 3.74177670429845, walkable: true } },
      { input: { x: 30, z: 0 }, output: { height: 1.2400789102892396, walkable: true } },
      { input: { x: 0, z: -31 }, output: { height: 0.0013107631936714048, walkable: false } },
    ],
  },
  safeZone: {
    predicate: 'isWorldSafeZone(undefined,x,z)',
    samples: [
      { input: { x: 0, z: 8 }, output: { safe: true, zoneId: 'starter-village' } },
      { input: { x: 30, z: 0 }, output: { safe: false, zoneId: null } },
      { input: { x: 360, z: -65 }, output: { safe: true, zoneId: 'sunscar-caravan-city' } },
      { input: { x: 360, z: -40 }, output: { safe: false, zoneId: null } },
    ],
  },
  behavior: {
    fixedTickHz: 60,
    aggro: { engageWhenDistanceLessThan: 'type.aggroRange', requiresNotReturningHome: true },
    leash: { distance: 'min(type.aggroRange*1.15,15)', returnHomeUntilDistanceLessThan: 2.5 },
    wander: { resetWhenTimerAtMost: 0, timer: '1.5+random*2.5', homeRadius: 3, speedMultiplier: 0.4 },
    return: { speedMultiplier: 0.5 },
    movement: { rejectWhenGroundBelow: 0.25, rejectSafeZoneEntry: true },
  },
  lifecycle: {
    islandChange: ['clearPendingAttacks', 'clearSeenHitDeltas', 'removeActors'],
    reconnect: ['clearOneShotBookkeeping', 'clearActorSequences', 'incrementGeneration', 'requestSnapshot'],
  },
});

export const PIRATE_CENTRAL_SPATIAL_VECTORS_JSON = JSON.stringify(PIRATE_CENTRAL_SPATIAL_VECTORS);

const evaluatorFormulas = [
  { id: 'starter-island', center: { x: 0, z: 0 }, radius: 60, local: 'x,z', expression: 'max(-0.9, falloff(1-d/60)*(3.2+sin(x*0.15)*cos(z*0.12)*1.1+sin(x*0.05+z*0.07)*1.6+cos(x*0.03-z*0.05)*0.9)-0.9)', constants: { seaFloor: -0.9, base: 3.2, smoothstep: 't*t*(3-2*t)' } },
  { id: 'mist-jungle', center: { x: 170, z: -120 }, radius: 54, local: 'lx=x-170,lz=z+120', expression: 'max(-0.9, falloff(1-d/54)*(4.5+sin(lx*0.13)*cos(lz*0.1)*1.25+sin(lx*0.055+lz*0.075)*1.5+cos(lx*0.045-lz*0.035)*0.8)-0.9)', constants: { seaFloor: -0.9, base: 4.5, smoothstep: 't*t*(3-2*t)' } },
  { id: 'sunscar-desert', center: { x: 360, z: -40 }, radius: 56, local: 'lx=x-360,lz=z+40', expression: 'max(-0.9, falloff(1-d/56)*(4.2+sin(lx*0.11)*cos(lz*0.09)*0.75+sin(lx*0.045+lz*0.065)*1.1+cos(lx*0.03-lz*0.05)*0.65)+sin((lx+lz)*0.18)*0.22*falloff(1-d/56)-0.9)', constants: { seaFloor: -0.9, base: 4.2, duneRippleAmplitude: 0.22, smoothstep: 't*t*(3-2*t)' } },
  { id: 'azure-frost', center: { x: 500, z: 110 }, radius: 58, local: 'lx=x-500,lz=z-110', expression: 'max(-0.9, falloff(1-d/58)*(4.35+sin(lx*0.105)*cos(lz*0.082)*0.9+sin(lx*0.042+lz*0.061)*1.35+cos(lx*0.033-lz*0.052)*0.82+smoothstep(lz,8,38)*1.25)-0.9)', constants: { seaFloor: -0.9, base: 4.35, northRise: 1.25, smoothstep: 't*t*(3-2*t)' } },
  { id: 'tempest-sky', center: { x: 430, z: 330 }, radius: 60, local: 'lx=x-430,lz=z-330', expression: 'max(-0.9, falloff(1-d/60)*(5.15+sin(lx*0.095)*cos(lz*0.078)*1.05+sin(lx*0.038+lz*0.057)*1.4+cos(lx*0.03-lz*0.046)*0.9+smoothstep(t,0.42,0.76)*1.45)-0.9)', constants: { seaFloor: -0.9, base: 5.15, plateau: 1.45, smoothstep: 't*t*(3-2*t)' } },
  { id: 'ember-volcano', center: { x: 220, z: 470 }, radius: 62, local: 'lx=x-220,lz=z-470', expression: 'max(-0.9, falloff(1-d/62)*(4.75+sin(lx*0.108)*cos(lz*0.086)*1.15+sin(lx*0.047+lz*0.063)*1.42+cos(lx*0.036-lz*0.052)*0.92+smoothstep(t,0.24,0.82)*3.1-exp(-(d*d)/(2*8.5*8.5))*2.2)-0.9)', constants: { seaFloor: -0.9, base: 4.75, volcanicRise: 3.1, craterSigma: 8.5, craterDepth: 2.2, smoothstep: 't*t*(3-2*t)' } },
] as const;

function spatialCorpus() {
  const points: Array<{ label: string; x: number; z: number }> = [];
  for (const island of ISLANDS) {
    points.push(
      { label: `${island.id}:center`, x: island.center.x, z: island.center.z },
      { label: `${island.id}:edge+`, x: island.center.x + island.radius, z: island.center.z },
      { label: `${island.id}:outside+`, x: island.center.x + island.radius + 0.001, z: island.center.z },
    );
  }
  for (const spawn of [...MONSTER_CAMPS, ...BOSS_SPAWNS]) {
    points.push({ label: `spawn:${spawn.islandId}:${spawn.typeId}`, x: spawn.x, z: spawn.z });
  }
  for (const zone of WORLD_SAFE_ZONES) {
    points.push(
      { label: `safe:${zone.id}:center`, x: zone.x, z: zone.z },
      { label: `safe:${zone.id}:edge`, x: zone.x + zone.radius, z: zone.z },
      { label: `safe:${zone.id}:outside`, x: zone.x + zone.radius + 0.001, z: zone.z },
    );
  }
  const samples = points.map((point) => ({
    label: point.label,
    input: { x: point.x, z: point.z },
    output: { height: worldHeightAt(point.x, point.z), safeZoneId: worldSafeZoneAt(undefined, point.x, point.z)?.id ?? null },
  }));
  return [...samples,
    { label: 'threshold:walk-min', input: { x: 0, z: 0 }, output: { groundThreshold: 0.25 } },
    { label: 'threshold:spawn-acceptance', input: { x: 0, z: 0 }, output: { groundThreshold: 0.6 } },
    { label: 'invalid:nan', input: { x: 'NaN', z: 0 }, output: { valid: false } },
    { label: 'invalid:infinity', input: { x: 'Infinity', z: 0 }, output: { valid: false } },
  ];
}

export const PIRATE_CENTRAL_SPATIAL_EVALUATOR = Object.freeze({
  schema: 'pirate-central-spatial-evaluator/1',
  sourceRevision: 'IslandRegistry+safeZones@3042e49',
  constants: { seaFloorHeight: -0.9, walkGroundMinimum: 0.25, spawnGroundAcceptance: 0.6, islandBoundary: 'distance<=radius', safeBoundary: 'distance<=radius' },
  precedence: { height: 'max(seaFloorHeight,islandHeightAt in ISLANDS declaration order)', safeZone: 'first WORLD_SAFE_ZONES declaration matching optional islandId and distance<=radius' },
  regions: evaluatorFormulas,
  safeZones: WORLD_SAFE_ZONES,
  goldenCorpus: spatialCorpus(),
});

export const PIRATE_CENTRAL_SPATIAL_EVALUATOR_JSON = JSON.stringify(PIRATE_CENTRAL_SPATIAL_EVALUATOR);
