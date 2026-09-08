import { MONSTER_TYPES } from './MonsterData';
import {
  BASE_PLAYER_ENERGY,
  BASE_PLAYER_HP,
  BASE_PLAYER_MP,
  DAMAGE_MULTIPLIER_AT_MAX_STAT,
  ENERGY_PER_COMBAT,
  HP_PER_VITALITY,
  MAX_PLAYER_STAT,
  MP_PER_MANA,
  DAMAGE_PER_STAT_POINT,
} from '@pirate-fruit/shared';

/** Source hashes are recorded so a Server importer cannot silently use a different catalog. */
export const PIRATE_CENTRAL_COMBAT_SOURCE = {
  monsterData: { path: 'client/src/monster/MonsterData.ts', gitBlobSha: '76ee6198f26ec501bf3ba60e1f78b1a23ffa2a16' },
  monsterManager: { path: 'client/src/monster/MonsterManager.ts', gitBlobSha: '0be511701a4f2bcf5c562edc922eae9f4a10ac89' },
  playerCombat: { path: 'client/src/combat/PlayerCombat.ts', gitBlobSha: '6d46a9226a7768a420dc22a37f539615aaf98832' },
  combatData: { path: 'client/src/combat/CombatData.ts', gitBlobSha: 'bbcc1ef2c39d7a3aa34addcd7b3b62724e580d01' },
  sharedStats: { path: 'shared/src/progression/stats.ts', gitBlobSha: 'af97d97794fe87b5d7d1ad70a84442b3fa0d6d95' },
  serverProfile: { path: 'server/src/realtime/combatProfile.ts', gitBlobSha: '56e1221525cf0d74606d8d0641751ca9cb92e5e7' },
} as const;

const monsterTypes = Object.values(MONSTER_TYPES).map((type) => ({
  id: type.id,
  kind: type.kind,
  level: type.level,
  maxHp: type.maxHp,
  damage: type.damage,
  moveSpeed: type.moveSpeed,
  aggroRange: type.aggroRange,
  attackRange: type.attackRange,
  attackCooldown: type.attackCooldown,
  spawn: { scale: type.scale },
  ...(type.heavyAttack ? { heavyAttack: { ...type.heavyAttack } } : {}),
  rules: {
    leashDistance: Math.min(type.aggroRange * 1.15, 15),
    returnHomeDistance: 2.5,
    chaseHitRangeMultiplier: 1.6,
    heavyCooldownMultiplier: 1.25,
  },
}));

const playerProfile = {
  statBounds: { min: 1, max: MAX_PLAYER_STAT },
  resourceCaps: {
    baseHp: BASE_PLAYER_HP,
    hpPerVitality: HP_PER_VITALITY,
    baseEnergy: BASE_PLAYER_ENERGY,
    energyPerCombat: ENERGY_PER_COMBAT,
    baseMp: BASE_PLAYER_MP,
    mpPerMana: MP_PER_MANA,
  },
  damageScaling: {
    maxMultiplier: DAMAGE_MULTIPLIER_AT_MAX_STAT,
    damagePerStatPoint: DAMAGE_PER_STAT_POINT,
    formula: '1 + (normalizedStat(categoryStat) - 1) * damagePerStatPoint',
    finalDamage: 'max(1, round(baseDamage * statDamageMultiplier))',
  },
  defense: { available: false, source: 'no defense/armor stat or reduction formula exists in the canonical client/server profile' },
  authoritativeProfile: {
    source: 'server/src/realtime/combatProfile.ts',
    categories: ['style', 'sword', 'gun', 'fruit'],
    profileFields: ['level', 'stats', 'maxHp', 'maxEnergy', 'maxMp', 'weaponCategory', 'activeSkillCategory', 'allowedSkillCategories'],
    persistenceQuery: 'characters + player_progression + player_equipment(slot=state)',
    cacheTtlMs: 1000,
  },
};

export const PIRATE_CENTRAL_COMBAT_CATALOG = {
  schema: 'pirate-central-combat/1',
  contentRevision: 'pirate-monster-combat-catalog-2026-09-08',
  units: { distance: 'world-units', speed: 'world-units/second', cooldown: 'seconds', damage: 'raw points before player mitigation' },
  source: PIRATE_CENTRAL_COMBAT_SOURCE,
  monsterTypes,
  attackRules: {
    fixedTickHz: 60,
    aggro: 'engage when distance < type.aggroRange and not returningHome',
    normal: 'when distance <= type.attackRange and attackCooldown <= 0, raw damage=type.damage, cooldown=type.attackCooldown',
    heavy: 'if heavyAttack and (attackCount+1) % everyNth === 0, telegraph first; release only if distance <= type.attackRange*1.6; raw damage=type.damage*multiplier; cooldown=type.attackCooldown*1.25',
    chaseRecovery: 'staggerTimer=max(staggerTimer,0.22) after normal hit',
    movement: { returnSpeedMultiplier: 0.8, rejectGroundBelow: 0.25, rejectSafeZoneEntry: true },
    lifecycle: { death: 'Monster.respawn after respawnTimer; transient crew despawns after finished death animation', respawn: 'reset HP/state at home ground height' },
  },
  playerProfile,
} as const;

export const PIRATE_CENTRAL_COMBAT_CATALOG_JSON = JSON.stringify(PIRATE_CENTRAL_COMBAT_CATALOG);

