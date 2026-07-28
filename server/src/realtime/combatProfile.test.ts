import { afterEach, describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';
import { resourceCapsForStats, statDamageMultiplier } from '@pirate-fruit/shared';
import type { Pool } from 'pg';
import {
  PostgresCombatProfileProvider,
  combatCategoryFor,
  combatDamageMultiplier,
} from './combatProfile.js';

const pools: Pool[] = [];

afterEach(async () => {
  await Promise.all(pools.splice(0).map((pool) => pool.end()));
});

async function poolWithProfile(): Promise<Pool> {
  const memory = newDb();
  const adapter = memory.adapters.createPg();
  const pool = new adapter.Pool() as unknown as Pool;
  pools.push(pool);
  await pool.query('create table characters (id text primary key, level integer not null)');
  await pool.query(`
    create table player_progression (
      character_id text primary key,
      combat integer, vitality integer, blade integer,
      ranged integer, fruit_power integer, mana integer
    )
  `);
  await pool.query(`
    create table player_equipment (
      character_id text,
      slot text,
      metadata_json jsonb
    )
  `);
  await pool.query(`insert into characters (id, level) values ('char-a', 27)`);
  await pool.query(`
    insert into player_progression
      (character_id, combat, vitality, blade, ranged, fruit_power, mana)
    values ('char-a', 10, 20, 30, 40, 50, 60)
  `);
  await pool.query(`
    insert into player_equipment (character_id, slot, metadata_json)
    values (
      'char-a',
      'state',
      '{"inventoryLoadout":{"activeSet":"fruit","equippedWeaponKind":"sword","equippedFruitId":"flame"}}'
    )
  `);
  return pool;
}

describe('authoritative combat profile', () => {
  it('reads Server-owned stats and persisted loadout for real combat effects', async () => {
    const pool = await poolWithProfile();
    const provider = new PostgresCombatProfileProvider(pool, () => 1_000, 0);
    const profile = await provider.profile('char-a');

    expect(profile.level).toBe(27);
    expect(profile.stats).toEqual({
      combat: 10,
      vitality: 20,
      blade: 30,
      ranged: 40,
      fruitPower: 50,
      mana: 60,
    });
    expect(profile).toMatchObject(resourceCapsForStats(profile.stats));
    expect(profile.weaponCategory).toBe('sword');
    expect(profile.activeSkillCategory).toBe('fruit');
    expect(profile.allowedSkillCategories).toEqual(['sword', 'fruit']);
  });

  it('uses only a category allowed by persisted equipment', async () => {
    const pool = await poolWithProfile();
    const profile = await new PostgresCombatProfileProvider(pool, () => 1_000, 0)
      .profile('char-a');

    expect(combatCategoryFor(profile, 'melee', 'fruit')).toBe('sword');
    expect(combatCategoryFor(profile, 'skill', 'fruit')).toBe('fruit');
    expect(combatCategoryFor(profile, 'skill', 'gun')).toBe('fruit');
    expect(combatDamageMultiplier(profile, 'melee', 'fruit'))
      .toBeCloseTo(statDamageMultiplier(profile.stats, 'sword'));
  });
});
