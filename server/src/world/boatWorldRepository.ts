import type { Pool } from 'pg';
import type { BoatWorldState } from '@pirate-fruit/shared';
import type { BoatWorldRow, CanonicalBoat } from './boatSimulation.js';

export interface BoatWorldRepository {
  loadAll(): Promise<BoatWorldRow[]>;
  loadActiveBoat(characterId: string): Promise<CanonicalBoat | null>;
  saveAll(rows: readonly BoatWorldRow[]): Promise<void>;
}

const passengers = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

export class PostgresBoatWorldRepository implements BoatWorldRepository {
  constructor(private readonly pool: Pool) {}

  async loadAll(): Promise<BoatWorldRow[]> {
    const result = await this.pool.query<{
      boat_id: string; owner_id: string; definition_id: string; island_id: string;
      x: number; z: number; heading: number; speed: number; hp: number; max_hp: number;
      anchor: boolean; state: BoatWorldState; helm_id: string | null;
      passenger_ids: unknown; respawn_at: string | number | null;
    }>('select * from world_boat_state order by boat_id');
    return result.rows.map((row) => ({
      entityId: row.boat_id,
      ownerId: row.owner_id,
      definitionId: row.definition_id,
      islandId: row.island_id,
      x: row.x,
      z: row.z,
      heading: row.heading,
      speed: row.speed,
      hp: row.hp,
      maxHp: row.max_hp,
      anchor: row.anchor,
      state: row.state,
      helmId: row.helm_id ?? undefined,
      passengerIds: passengers(row.passenger_ids),
      respawnAt: row.respawn_at === null ? undefined : Number(row.respawn_at),
    }));
  }

  async loadActiveBoat(characterId: string): Promise<CanonicalBoat | null> {
    const result = await this.pool.query<{
      id: string; character_id: string; boat_definition_id: string;
      hp: number; max_hp: number; cargo_capacity: number;
    }>(
      `select id, character_id, boat_definition_id, hp, max_hp, cargo_capacity
         from player_boats
        where character_id = $1 and is_active = true
        limit 1`,
      [characterId],
    );
    const row = result.rows[0];
    return row ? {
      entityId: row.id,
      ownerId: row.character_id,
      definitionId: row.boat_definition_id,
      hp: row.hp,
      maxHp: row.max_hp,
      cargoCapacity: row.cargo_capacity,
    } : null;
  }

  async saveAll(rows: readonly BoatWorldRow[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      for (const row of rows) {
        await client.query(
          `insert into world_boat_state
             (boat_id, owner_id, definition_id, island_id, x, z, heading, speed,
              hp, max_hp, anchor, state, helm_id, passenger_ids, respawn_at, updated_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,now())
           on conflict (boat_id) do update set
             owner_id=excluded.owner_id, definition_id=excluded.definition_id,
             island_id=excluded.island_id, x=excluded.x, z=excluded.z,
             heading=excluded.heading, speed=excluded.speed, hp=excluded.hp,
             max_hp=excluded.max_hp, anchor=excluded.anchor, state=excluded.state,
             helm_id=excluded.helm_id, passenger_ids=excluded.passenger_ids,
             respawn_at=excluded.respawn_at, updated_at=now()`,
          [row.entityId, row.ownerId, row.definitionId, row.islandId, row.x, row.z,
            row.heading, row.speed, row.hp, row.maxHp, row.anchor, row.state,
            row.helmId ?? null, JSON.stringify(row.passengerIds), row.respawnAt ?? null],
        );
        // Canonical owned boat HP follows the world entity; cargo remains attached to this boat id.
        await client.query(
          'update player_boats set hp = $2, max_hp = $3, updated_at = now() where id = $1 and character_id = $4',
          [row.entityId, row.hp, row.maxHp, row.ownerId],
        );
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
