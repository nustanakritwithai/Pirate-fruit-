import { afterEach, describe, expect, it } from 'vitest';
import { newDb } from 'pg-mem';
import type { Pool } from 'pg';
import {
  MovementAuthority,
  PLAYER_MAX_MOVEMENT_SPEED,
  PostgresMovementAnchorProvider,
} from './movementAuthority.js';

const pools: Pool[] = [];

afterEach(async () => {
  await Promise.all(pools.splice(0).map((pool) => pool.end()));
});

const at = (x: number, islandId = 'starter-island') => ({
  islandId,
  x,
  y: 0,
  z: 0,
  heading: 0,
});

describe('authoritative player movement', () => {
  it('accepts legitimate sprint/dash movement within the accumulated budget', () => {
    const movement = new MovementAuthority();
    movement.seed('char-a', at(0), 1_000);

    const decision = movement.move('char-a', at(7), 1_100);

    expect(decision.accepted).toBe(true);
    expect(decision.position.x).toBe(7);
  });

  it('clamps a forged teleport to the Server speed budget', () => {
    const movement = new MovementAuthority();
    movement.seed('char-a', at(0), 1_000);
    // Spend the initial burst first so repeated packets cannot gain free distance.
    expect(movement.move('char-a', at(8), 1_000).accepted).toBe(true);

    const decision = movement.move('char-a', at(500), 1_100);

    expect(decision).toMatchObject({ accepted: false, reason: 'speed' });
    expect(decision.position.x).toBeCloseTo(8 + PLAYER_MAX_MOVEMENT_SPEED * 0.1);
  });

  it('rejects a client-selected island transition', () => {
    const movement = new MovementAuthority();
    movement.seed('char-a', at(10), 1_000);

    const decision = movement.move('char-a', at(10, 'mist-jungle'), 2_000);

    expect(decision).toMatchObject({
      accepted: false,
      reason: 'island',
      position: { islandId: 'starter-island', x: 10 },
    });
  });

  it('keeps the canonical coordinate across reconnect', () => {
    const movement = new MovementAuthority();
    movement.seed('char-a', at(0), 1_000);
    movement.move('char-a', at(8), 1_000);
    movement.disconnect('char-a', 1_100);

    expect(movement.connect('char-a')).toBe(true);
    expect(movement.positionOf('char-a')).toMatchObject({ x: 8 });
  });
});

describe('Postgres movement anchor', () => {
  async function pool(): Promise<Pool> {
    const memory = newDb();
    const adapter = memory.adapters.createPg();
    const result = new adapter.Pool() as unknown as Pool;
    pools.push(result);
    await result.query(`
      create table characters (
        id text primary key,
        current_island_id text not null
      )
    `);
    await result.query(`
      create table player_checkpoints (
        character_id text primary key,
        position_json jsonb not null,
        heading real
      )
    `);
    return result;
  }

  it('loads the first canonical coordinate from the persisted checkpoint', async () => {
    const database = await pool();
    await database.query(`
      insert into characters (id, current_island_id)
      values ('char-a', 'mist-jungle')
    `);
    await database.query(`
      insert into player_checkpoints (character_id, position_json, heading)
      values ('char-a', '{"x":171,"y":3,"z":-99}', 1.25)
    `);

    const anchor = await new PostgresMovementAnchorProvider(database).anchor('char-a');

    expect(anchor).toEqual({
      islandId: 'mist-jungle',
      x: 171,
      y: 3,
      z: -99,
      heading: 1.25,
    });
  });

  it('falls back to the island spawn when no checkpoint exists', async () => {
    const database = await pool();
    await database.query(`
      insert into characters (id, current_island_id)
      values ('char-a', 'starter-island')
    `);

    const anchor = await new PostgresMovementAnchorProvider(database).anchor('char-a');

    expect(anchor).toMatchObject({ islandId: 'starter-island', x: 0, z: 8 });
  });
});
