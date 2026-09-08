import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MONSTER_TYPES } from '../MonsterData';
import {
  PIRATE_CENTRAL_COMBAT_CATALOG,
  PIRATE_CENTRAL_COMBAT_CATALOG_JSON,
  PIRATE_CENTRAL_COMBAT_SOURCE,
} from '../PirateCentralCombatCatalog';

const ARTIFACT_SHA256 = 'FED8FF31C57535D1FC9DB84644610362534335443ACEF651BF0BD29B00319262';

describe('Pirate central combat catalog', () => {
  it('is source-derived, deterministic, and contains all 24 real monster profiles', () => {
    expect(PIRATE_CENTRAL_COMBAT_CATALOG.schema).toBe('pirate-central-combat/1');
    expect(PIRATE_CENTRAL_COMBAT_CATALOG.monsterTypes).toHaveLength(Object.keys(MONSTER_TYPES).length);
    expect(PIRATE_CENTRAL_COMBAT_CATALOG.monsterTypes).toHaveLength(24);
    expect(PIRATE_CENTRAL_COMBAT_CATALOG.monsterTypes.every((type) =>
      type.maxHp > 0 && type.damage >= 0 && type.moveSpeed > 0 && type.attackRange > 0 && type.attackCooldown > 0,
    )).toBe(true);
    expect(PIRATE_CENTRAL_COMBAT_CATALOG.monsterTypes.some((type) => type.heavyAttack?.telegraph)).toBe(true);
    expect(PIRATE_CENTRAL_COMBAT_CATALOG.monsterTypes.every((type) =>
      type.rules.leashDistance === Math.min(type.aggroRange * 1.15, 15)
      && type.rules.returnHomeDistance === 2.5,
    )).toBe(true);
    for (const type of PIRATE_CENTRAL_COMBAT_CATALOG.monsterTypes) {
      expect(type).not.toHaveProperty('reward');
      expect(type).not.toHaveProperty('color');
    }
  });

  it('records exact source provenance and explicit missing defense evidence', () => {
    expect(PIRATE_CENTRAL_COMBAT_SOURCE.monsterData.path).toBe('client/src/monster/MonsterData.ts');
    expect(PIRATE_CENTRAL_COMBAT_SOURCE.serverProfile.path).toBe('server/src/realtime/combatProfile.ts');
    expect(PIRATE_CENTRAL_COMBAT_CATALOG.playerProfile.resourceCaps).toEqual({
      baseHp: 100, hpPerVitality: 5, baseEnergy: 100, energyPerCombat: 5, baseMp: 100, mpPerMana: 5,
    });
    expect(PIRATE_CENTRAL_COMBAT_CATALOG.playerProfile.defense).toMatchObject({ available: false });
    expect(PIRATE_CENTRAL_COMBAT_CATALOG.playerProfile.authoritativeProfile.cacheTtlMs).toBe(1000);
  });

  it('keeps the committed raw artifact byte-identical to the generated export', () => {
    const artifact = readFileSync(resolve(__dirname, '../pirate-central-combat.catalog.json'), 'utf8');
    expect(artifact).toBe(PIRATE_CENTRAL_COMBAT_CATALOG_JSON);
    expect(createHash('sha256').update(artifact).digest('hex').toUpperCase()).toBe(ARTIFACT_SHA256);
    expect(JSON.parse(artifact)).toEqual(PIRATE_CENTRAL_COMBAT_CATALOG);
  });
});

