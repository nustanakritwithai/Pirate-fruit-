import { randomUUID } from 'node:crypto';
import {
  STAT_POINTS_PER_LEVEL,
  type BoatDefinitionId,
  type IslandId,
} from '@pirate-fruit/shared';
import type { Pool, PoolClient } from 'pg';
import {
  canonicalBoatData,
  canonicalResourceCaps,
  defaultPlayerState,
  defaultProgression,
  PlayerDocumentValidationError,
  type CanonicalBoat,
  type CanonicalCargo,
  type CanonicalCheckpoint,
  type CanonicalInventory,
  type CanonicalLegacyLoadout,
  type CanonicalMasteryEntry,
  type CanonicalPlayerState,
  type CanonicalProgression,
} from './playerState.js';

export type PlayerSaveOperation = 'save' | 'checkpoint' | 'cargo' | 'migration';

export interface StoredRemotePlayerState {
  revision: number;
  migrated: boolean;
  state: CanonicalPlayerState | null;
}

export interface PlayerSaveMutationResult {
  revision: number;
  idempotentReplay: boolean;
  migrated: boolean;
}

export interface PlayerSaveMutationIdentity {
  characterId: string;
  operation: PlayerSaveOperation;
  idempotencyKey: string;
  requestHash: string;
  expectedRevision?: number;
}

export interface PlayerSaveRepository {
  load(characterId: string): Promise<StoredRemotePlayerState>;
  /** One-time repair for a character whose first remote save came from legacy Local data. */
  resetLegacyProgress(characterId: string): Promise<PlayerSaveMutationResult>;
  save(
    identity: PlayerSaveMutationIdentity,
    state: CanonicalPlayerState,
  ): Promise<PlayerSaveMutationResult>;
  saveCheckpoint(
    identity: PlayerSaveMutationIdentity,
    state: CanonicalPlayerState,
  ): Promise<PlayerSaveMutationResult>;
  saveCargo(
    identity: PlayerSaveMutationIdentity,
    state: CanonicalPlayerState,
  ): Promise<PlayerSaveMutationResult>;
  migrate(
    identity: PlayerSaveMutationIdentity,
    state: CanonicalPlayerState,
  ): Promise<PlayerSaveMutationResult>;
}

export class PlayerStateNotFoundError extends Error {
  constructor() {
    super('Authenticated character no longer exists');
    this.name = 'PlayerStateNotFoundError';
  }
}

export class SaveRevisionConflictError extends Error {
  constructor(readonly currentRevision: number) {
    super(`Save revision is stale; current revision is ${currentRevision}`);
    this.name = 'SaveRevisionConflictError';
  }
}

export class SaveIdempotencyConflictError extends Error {
  constructor() {
    super('Idempotency key was already used with a different request');
    this.name = 'SaveIdempotencyConflictError';
  }
}

export class LocalMigrationAlreadyAppliedError extends Error {
  constructor() {
    super('Local save migration has already been applied or remote progress already exists');
    this.name = 'LocalMigrationAlreadyAppliedError';
  }
}

interface CharacterRow {
  save_revision: string;
  local_save_migrated_at: Date | null;
  level: number;
  coins: string;
  current_island_id: string;
  spawn_id: string;
}

function numberFromBigint(value: string | bigint | number): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error('Database value exceeds the safe JSON integer range');
  }
  return result;
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseMastery(value: unknown): Record<string, CanonicalMasteryEntry> {
  return jsonRecord(value) as Record<string, CanonicalMasteryEntry>;
}

function masteryExpRequired(level: number): number {
  return Math.floor(40 + level * 18 + level * level * 1.6);
}

/** Convert the persisted level/remaining-exp representation back to earned lifetime XP. */
function masteryLifetimeExp(entry: CanonicalMasteryEntry): number {
  let total = Math.max(0, Math.floor(entry.exp));
  const level = Math.max(1, Math.min(600, Math.floor(entry.level)));
  for (let current = 1; current < level; current += 1) total += masteryExpRequired(current);
  return total;
}

function totalMasteryExp(mastery: Record<string, CanonicalMasteryEntry>): number {
  return Object.values(mastery).reduce((sum, entry) => sum + masteryLifetimeExp(entry), 0);
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const expected = new Set(left);
  return expected.size === right.length && right.every((id) => expected.has(id));
}

function equipmentState(rows: Array<{ slot: string; metadata_json: unknown }>): {
  inventory: CanonicalInventory['loadout'];
  legacy: CanonicalLegacyLoadout;
} {
  const metadata = jsonRecord(rows.find((row) => row.slot === 'state')?.metadata_json);
  const fallback = defaultPlayerState();
  return {
    inventory: (metadata.inventoryLoadout ?? fallback.inventory.loadout) as CanonicalInventory['loadout'],
    legacy: (metadata.legacyLoadout ?? fallback.loadout) as CanonicalLegacyLoadout,
  };
}

export interface PlayerSaveRepositoryOptions {
  /** S12: level/exp เป็นของ Server (เดินจาก EXP ที่ Server แจก) — save ห้ามเขียนทับ */
  preserveServerProgression?: boolean;
  /** S10: player_quests เป็นของ Quest API — save ทั่วไปห้ามลบหรือเขียนทับ */
  preserveServerQuests?: boolean;
  /** ร้าน Server เป็นเจ้าของ item acquisition; save รับได้เฉพาะ equip/use จากของที่มีจริง */
  preserveServerInventory?: boolean;
}

export class PostgresPlayerSaveRepository implements PlayerSaveRepository {
  constructor(
    private readonly pool: Pool,
    private readonly repositoryOptions: PlayerSaveRepositoryOptions = {},
  ) {}

  async load(characterId: string): Promise<StoredRemotePlayerState> {
    const client = await this.pool.connect();
    try {
      await client.query('begin isolation level repeatable read read only');
      const result = await this.loadWithClient(client, characterId);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async resetLegacyProgress(characterId: string): Promise<PlayerSaveMutationResult> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const character = await client.query<{
        save_revision: string;
        local_save_migrated_at: Date | null;
        level: number;
      }>(
        `select save_revision, local_save_migrated_at, level
           from characters
          where id = $1
          for update`,
        [characterId],
      );
      const row = character.rows[0];
      if (!row) throw new PlayerStateNotFoundError();
      const revision = numberFromBigint(row.save_revision);
      const idempotencyKey = 'legacy-progress-reset-v1';
      const requestHash = 'legacy-progress-reset-v1';
      const prior = await client.query<{
        operation: PlayerSaveOperation;
        request_hash: string;
        resulting_revision: string;
      }>(
        `select operation, request_hash, resulting_revision
           from player_save_operations
          where character_id = $1 and idempotency_key = $2`,
        [characterId, idempotencyKey],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].operation !== 'save' || prior.rows[0].request_hash !== requestHash) {
          throw new SaveIdempotencyConflictError();
        }
        await client.query('commit');
        return {
          revision: numberFromBigint(prior.rows[0].resulting_revision),
          idempotentReplay: true,
          migrated: row.local_save_migrated_at !== null,
        };
      }

      // Only repair characters that were actually imported from the old Local save.
      // Newly-created clean online characters are left completely untouched.
      if (row.local_save_migrated_at === null) {
        await client.query('commit');
        return { revision, idempotentReplay: true, migrated: false };
      }

      const progressionResult = await client.query<{ exp: string }>(
        'select exp::text as exp from player_progression where character_id = $1',
        [characterId],
      );
      const exp = progressionResult.rows[0]?.exp ?? '0';
      const resetState = defaultPlayerState();
      const resetProgression: CanonicalProgression = {
        ...resetState.progression,
        level: row.level,
        exp: numberFromBigint(exp),
        statPoints: Math.max(0, (row.level - 1) * STAT_POINTS_PER_LEVEL),
      };
      const caps = canonicalResourceCaps(resetProgression);
      await client.query(
        `insert into player_progression
          (character_id, exp, stat_points, combat, vitality, blade, ranged,
           fruit_power, mana, mastery_json, updated_at)
         values ($1,$2,$3,1,1,1,1,1,1,$4::jsonb,now())
         on conflict (character_id) do update set
           stat_points = excluded.stat_points,
           combat = 1, vitality = 1, blade = 1, ranged = 1,
           fruit_power = 1, mana = 1,
           mastery_json = excluded.mastery_json, updated_at = now()`,
        [characterId, exp, resetProgression.statPoints, JSON.stringify(resetProgression.mastery)],
      );
      await client.query(
        `insert into player_stats
          (character_id, hp, max_hp, mp, max_mp, energy, max_energy, derived_json, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,'{}'::jsonb,now())
         on conflict (character_id) do update set
           hp = excluded.hp, max_hp = excluded.max_hp,
           mp = excluded.mp, max_mp = excluded.max_mp,
           energy = excluded.energy, max_energy = excluded.max_energy,
           updated_at = now()`,
        [characterId, caps.maxHp, caps.maxHp, caps.maxMp, caps.maxMp, caps.maxEnergy, caps.maxEnergy],
      );
      await this.persistInventory(client, characterId, resetState.inventory, resetState.loadout);

      const nextRevision = revision + 1;
      await client.query(
        `update characters set save_revision = $2, updated_at = now() where id = $1`,
        [characterId, String(nextRevision)],
      );
      await client.query(
        `insert into player_save_operations
          (character_id, operation, idempotency_key, request_hash, resulting_revision)
         values ($1,'save',$2,$3,$4)`,
        [characterId, idempotencyKey, requestHash, String(nextRevision)],
      );
      await client.query('commit');
      return { revision: nextRevision, idempotentReplay: false, migrated: true };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  save(
    identity: PlayerSaveMutationIdentity,
    state: CanonicalPlayerState,
  ): Promise<PlayerSaveMutationResult> {
    return this.mutate(identity, async (client) => {
      await this.persistPlayer(client, identity.characterId, state);
    });
  }

  saveCheckpoint(
    identity: PlayerSaveMutationIdentity,
    state: CanonicalPlayerState,
  ): Promise<PlayerSaveMutationResult> {
    return this.mutate(identity, async (client) => {
      await this.persistPlayer(client, identity.characterId, state);
    });
  }

  saveCargo(
    identity: PlayerSaveMutationIdentity,
    state: CanonicalPlayerState,
  ): Promise<PlayerSaveMutationResult> {
    return this.mutate(identity, async (client) => {
      await this.persistPlayer(client, identity.characterId, state);
      await this.persistCargo(client, identity.characterId, state.cargo);
    });
  }

  migrate(
    identity: PlayerSaveMutationIdentity,
    state: CanonicalPlayerState,
  ): Promise<PlayerSaveMutationResult> {
    return this.mutate(
      identity,
      async (client) => {
        await this.persistPlayer(client, identity.characterId, state, true);
        await this.persistCargo(client, identity.characterId, state.cargo);
      },
      true,
    );
  }

  private async mutate(
    identity: PlayerSaveMutationIdentity,
    apply: (client: PoolClient) => Promise<void>,
    markMigrated = false,
  ): Promise<PlayerSaveMutationResult> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const character = await client.query<Pick<CharacterRow, 'save_revision' | 'local_save_migrated_at'>>(
        `select save_revision, local_save_migrated_at
           from characters
          where id = $1
          for update`,
        [identity.characterId],
      );
      const row = character.rows[0];
      if (!row) throw new PlayerStateNotFoundError();
      const revision = numberFromBigint(row.save_revision);

      const prior = await client.query<{
        operation: PlayerSaveOperation;
        request_hash: string;
        resulting_revision: string;
      }>(
        `select operation, request_hash, resulting_revision
           from player_save_operations
          where character_id = $1 and idempotency_key = $2`,
        [identity.characterId, identity.idempotencyKey],
      );
      if (prior.rows[0]) {
        const operation = prior.rows[0];
        if (
          operation.operation !== identity.operation
          || operation.request_hash !== identity.requestHash
        ) {
          throw new SaveIdempotencyConflictError();
        }
        await client.query('commit');
        return {
          revision: numberFromBigint(operation.resulting_revision),
          idempotentReplay: true,
          migrated: row.local_save_migrated_at !== null,
        };
      }

      if (markMigrated) {
        if (row.local_save_migrated_at !== null || revision !== 0) {
          throw new LocalMigrationAlreadyAppliedError();
        }
      } else if (identity.expectedRevision !== revision) {
        throw new SaveRevisionConflictError(revision);
      }

      await apply(client);
      const nextRevision = revision + 1;
      await client.query(
        `update characters
            set save_revision = $2,
                local_save_migrated_at = case when $3 then now() else local_save_migrated_at end,
                updated_at = now()
          where id = $1`,
        [identity.characterId, String(nextRevision), markMigrated],
      );
      await client.query(
        `insert into player_save_operations
          (character_id, operation, idempotency_key, request_hash, resulting_revision)
         values ($1, $2, $3, $4, $5)`,
        [
          identity.characterId,
          identity.operation,
          identity.idempotencyKey,
          identity.requestHash,
          String(nextRevision),
        ],
      );
      await client.query('commit');
      return {
        revision: nextRevision,
        idempotentReplay: false,
        migrated: markMigrated || row.local_save_migrated_at !== null,
      };
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async loadWithClient(
    client: PoolClient,
    characterId: string,
  ): Promise<StoredRemotePlayerState> {
    const character = await client.query<CharacterRow>(
      `select save_revision, local_save_migrated_at, level, coins,
              current_island_id, spawn_id
         from characters
        where id = $1`,
      [characterId],
    );
    const row = character.rows[0];
    if (!row) throw new PlayerStateNotFoundError();

    const progressionResult = await client.query<{
      exp: string;
      stat_points: number;
      combat: number;
      vitality: number;
      blade: number;
      ranged: number;
      fruit_power: number;
      mana: number;
      mastery_json: unknown;
    }>('select * from player_progression where character_id = $1', [characterId]);
    if (!progressionResult.rows[0]) {
      return {
        revision: numberFromBigint(row.save_revision),
        migrated: row.local_save_migrated_at !== null,
        state: null,
      };
    }

    const statsResult = await client.query<{
      hp: number;
      max_hp: number;
      mp: number;
      max_mp: number;
      energy: number;
      max_energy: number;
    }>('select * from player_stats where character_id = $1', [characterId]);
    const checkpointResult = await client.query<{
      island_id: IslandId;
      spawn_id: string;
      position_json: { x: number; y: number; z: number };
      heading: number;
      camera_yaw: number;
      world_time: number;
    }>('select * from player_checkpoints where character_id = $1', [characterId]);
    const inventoryResult = await client.query<{
      item_id: string;
      quantity: number;
      metadata_json: unknown;
    }>('select item_id, quantity, metadata_json from player_inventory where character_id = $1', [characterId]);
    const equipmentResult = await client.query<{ slot: string; metadata_json: unknown }>(
      'select slot, metadata_json from player_equipment where character_id = $1',
      [characterId],
    );
    const boatResult = await client.query<{
      boat_definition_id: BoatDefinitionId;
      name: string;
      max_hp: number;
      cargo_capacity: number;
      upgrades_json: CanonicalBoat['upgrades'];
      is_active: boolean;
    }>('select * from player_boats where character_id = $1 order by created_at, id', [characterId]);
    const cargoResult = await client.query<{ commodity_id: string; quantity: number }>(
      'select commodity_id, quantity from player_cargo where character_id = $1 order by id',
      [characterId],
    );
    const questResult = await client.query<{
      quest_id: string;
      status: string;
      progress_json: { objectives?: unknown; counts?: unknown };
    }>('select quest_id, status, progress_json from player_quests where character_id = $1', [characterId]);

    const serverQuestAuthority = this.repositoryOptions.preserveServerQuests === true;
    const activeQuest = questResult.rows.find((quest) => (
      quest.status === 'active' || (serverQuestAuthority && quest.status === 'completed')
    ));
    const activeProgressRaw = activeQuest?.progress_json?.objectives
      ?? activeQuest?.progress_json?.counts;
    const activeQuestProgress = Array.isArray(activeProgressRaw)
      ? activeProgressRaw.map((count) => (
          typeof count === 'number' && Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
        ))
      : [];

    const progressionRow = progressionResult.rows[0];
    const progression: CanonicalProgression = {
      level: row.level,
      exp: numberFromBigint(progressionRow.exp),
      statPoints: progressionRow.stat_points,
      stats: {
        // Core schema รุ่นแรก default เป็น 0 แต่ gameplay canonical เริ่มที่ 1.
        combat: Math.max(1, progressionRow.combat),
        vitality: Math.max(1, progressionRow.vitality),
        blade: Math.max(1, progressionRow.blade),
        ranged: Math.max(1, progressionRow.ranged),
        fruitPower: Math.max(1, progressionRow.fruit_power),
        mana: Math.max(1, progressionRow.mana),
      },
      mastery: parseMastery(progressionRow.mastery_json),
      coins: numberFromBigint(row.coins),
      completedQuestIds: questResult.rows
        .filter((quest) => serverQuestAuthority
          ? quest.status === 'claimed'
          : quest.status === 'completed' || quest.status === 'claimed')
        .map((quest) => quest.quest_id),
      activeQuestId: activeQuest?.quest_id ?? null,
      activeQuestProgress,
    };
    const caps = canonicalResourceCaps(progression);
    const stats = statsResult.rows[0] ?? {
      hp: caps.maxHp,
      max_hp: caps.maxHp,
      mp: caps.maxMp,
      max_mp: caps.maxMp,
      energy: caps.maxEnergy,
      max_energy: caps.maxEnergy,
    };
    const checkpointRow = checkpointResult.rows[0];
    const checkpoint: CanonicalCheckpoint = checkpointRow
      ? {
          islandId: checkpointRow.island_id,
          spawnId: checkpointRow.spawn_id,
          position: checkpointRow.position_json,
          heading: checkpointRow.heading,
          cameraYaw: checkpointRow.camera_yaw,
          worldTime: checkpointRow.world_time,
          hp: stats.hp,
          mp: stats.mp,
          energy: stats.energy,
        }
      : defaultPlayerState().checkpoint;

    const owned = { sword: [] as string[], gun: [] as string[], style: [] as string[], fruit: [] as string[] };
    const consumables: Record<string, number> = {};
    for (const item of inventoryResult.rows) {
      const kind = jsonRecord(item.metadata_json).kind;
      if (kind === 'consumable') consumables[item.item_id] = item.quantity;
      else if (kind === 'sword') owned.sword.push(item.item_id);
      else if (kind === 'gun') owned.gun.push(item.item_id);
      else if (kind === 'style') owned.style.push(item.item_id);
      else if (kind === 'fruit') owned.fruit.push(item.item_id);
    }
    const savedEquipment = equipmentState(equipmentResult.rows);
    const inventory: CanonicalInventory = {
      ownedSwords: owned.sword,
      ownedGuns: owned.gun,
      ownedStyles: owned.style.length > 0 ? owned.style : ['combat'],
      ownedFruits: owned.fruit,
      consumables,
      quickslots: (jsonRecord(
        inventoryResult.rows.find((item) => item.item_id === '__inventory_meta__')?.metadata_json,
      ).quickslots as Array<string | null> | undefined) ?? [null, null],
      loadout: savedEquipment.inventory,
    };
    const boats: CanonicalBoat[] = boatResult.rows.map((boat) => ({
      definitionId: boat.boat_definition_id,
      name: boat.name,
      maxHp: boat.max_hp,
      cargoCapacity: boat.cargo_capacity,
      upgrades: boat.upgrades_json,
      active: boat.is_active,
    }));
    const activeBoat = boats.find((boat) => boat.active);
    const cargo: CanonicalCargo = {
      maxSlots: activeBoat?.cargoCapacity ?? 8,
      maxWeight: (activeBoat?.cargoCapacity ?? 8) * 15,
      slots: cargoResult.rows.map((slot) => ({
        commodityId: slot.commodity_id,
        quantity: slot.quantity,
      })),
    };
    return {
      revision: numberFromBigint(row.save_revision),
      migrated: row.local_save_migrated_at !== null,
      state: {
        checkpoint,
        progression,
        inventory,
        boats,
        loadout: savedEquipment.legacy,
        cargo,
      },
    };
  }

  private async persistPlayer(
    client: PoolClient,
    characterId: string,
    state: CanonicalPlayerState,
    trustedLegacyMigration = false,
  ): Promise<void> {
    const preserve = this.repositoryOptions.preserveServerProgression === true
      && !trustedLegacyMigration;
    const progression = preserve
      ? await this.authoritativeProgression(client, characterId, state.progression)
      : state.progression;
    const inventory = this.repositoryOptions.preserveServerInventory && !trustedLegacyMigration
      ? await this.authoritativeInventory(client, characterId, state.inventory, state.loadout)
      : state.inventory;
    // เมื่อ progression authority เปิด level/exp/coins เดินโดย Server เท่านั้น.
    // Client ส่งตำแหน่งและคำขอจัดสเตตัสที่ต้องผ่านการตรวจแต้ม; mastery ยังเป็น
    // transitional จนกว่า reward attribution จะย้ายเข้า combat authority ครบถ้วน.
    if (preserve) {
      await client.query(
        `update characters
            set current_island_id = $2, spawn_id = $3,
                updated_at = now()
          where id = $1`,
        [
          characterId,
          state.checkpoint.islandId,
          state.checkpoint.spawnId,
        ],
      );
    } else {
      await client.query(
        `update characters
            set level = $2, coins = $3, current_island_id = $4, spawn_id = $5,
                updated_at = now()
          where id = $1`,
        [
          characterId,
          progression.level,
          String(progression.coins),
          state.checkpoint.islandId,
          state.checkpoint.spawnId,
        ],
      );
    }
    await client.query(
      preserve
        ? `insert into player_progression
            (character_id, exp, stat_points, combat, vitality, blade, ranged,
             fruit_power, mana, mastery_json, updated_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,now())
           on conflict (character_id) do update set
             stat_points = excluded.stat_points,
             combat = excluded.combat, vitality = excluded.vitality,
             blade = excluded.blade, ranged = excluded.ranged,
             fruit_power = excluded.fruit_power, mana = excluded.mana,
             mastery_json = excluded.mastery_json, updated_at = now()`
        : `insert into player_progression
            (character_id, exp, stat_points, combat, vitality, blade, ranged,
             fruit_power, mana, mastery_json, updated_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,now())
           on conflict (character_id) do update set
             exp = excluded.exp, stat_points = excluded.stat_points,
             combat = excluded.combat, vitality = excluded.vitality,
             blade = excluded.blade, ranged = excluded.ranged,
             fruit_power = excluded.fruit_power, mana = excluded.mana,
             mastery_json = excluded.mastery_json, updated_at = now()`,
      [
        characterId,
        String(progression.exp),
        progression.statPoints,
        progression.stats.combat,
        progression.stats.vitality,
        progression.stats.blade,
        progression.stats.ranged,
        progression.stats.fruitPower,
        progression.stats.mana,
        JSON.stringify(progression.mastery),
      ],
    );
    await this.persistCheckpoint(client, characterId, state.checkpoint, progression);
    await this.persistInventory(client, characterId, inventory, state.loadout);
    await this.persistBoats(client, characterId, state.boats);
    if (!this.repositoryOptions.preserveServerQuests) {
      await this.persistQuests(client, characterId, progression);
    }
  }

  /**
   * Full-save requests may carry the browser mirror, but level/EXP/coins are always
   * reloaded from the locked Server rows. Stat allocation is accepted only when it
   * conserves the exact pool of unspent Server-issued points; arbitrary increases,
   * refunds, and decreases are rejected. Mastery may grow only within the aggregate
   * reward budget recorded by authoritative monster/quest transactions.
   */
  private async authoritativeProgression(
    client: PoolClient,
    characterId: string,
    proposed: CanonicalProgression,
  ): Promise<CanonicalProgression> {
    const character = await client.query<{ level: number; coins: string }>(
      'select level, coins::text as coins from characters where id = $1',
      [characterId],
    );
    const characterRow = character.rows[0];
    if (!characterRow) throw new PlayerStateNotFoundError();
    const stored = await client.query<{
      exp: string;
      stat_points: number;
      combat: number;
      vitality: number;
      blade: number;
      ranged: number;
      fruit_power: number;
      mana: number;
      mastery_json: unknown;
    }>(
      `select exp::text as exp, stat_points, combat, vitality, blade, ranged,
              fruit_power, mana, mastery_json
         from player_progression
        where character_id = $1
        for update`,
      [characterId],
    );
    const fallback = defaultProgression();
    const row = stored.rows[0];
    const currentStats = row
      ? {
          // Core schema รุ่นแรก default เป็น 0 แต่ gameplay canonical เริ่มที่ 1.
          // Normalize แถวเก่าโดยไม่คิดว่าแต้มฐานนี้เป็นการ allocate จาก client.
          combat: Math.max(1, row.combat),
          vitality: Math.max(1, row.vitality),
          blade: Math.max(1, row.blade),
          ranged: Math.max(1, row.ranged),
          fruitPower: Math.max(1, row.fruit_power),
          mana: Math.max(1, row.mana),
        }
      : fallback.stats;
    const currentStatPoints = row?.stat_points
      ?? Math.max(0, (characterRow.level - 1) * STAT_POINTS_PER_LEVEL);
    const statIds = Object.keys(currentStats) as Array<keyof typeof currentStats>;
    let allocated = 0;
    for (const statId of statIds) {
      const delta = proposed.stats[statId] - currentStats[statId];
      if (!Number.isInteger(delta) || delta < 0) {
        throw new PlayerDocumentValidationError(
          `Server stat '${statId}' cannot be decreased or refunded by a save`,
        );
      }
      allocated += delta;
    }
    if (allocated > currentStatPoints || proposed.statPoints !== currentStatPoints - allocated) {
      throw new PlayerDocumentValidationError(
        'Client stat allocation does not match Server-issued stat points',
      );
    }
    const currentMastery = parseMastery(row?.mastery_json);
    for (const [itemId, current] of Object.entries(currentMastery)) {
      const next = proposed.mastery[itemId];
      if (!next || masteryLifetimeExp(next) < masteryLifetimeExp(current)) {
        throw new PlayerDocumentValidationError(
          `Server mastery '${itemId}' cannot be decreased or reassigned by a save`,
        );
      }
    }
    const inventoryRows = await client.query<{ item_id: string; metadata_json: unknown }>(
      'select item_id, metadata_json from player_inventory where character_id = $1',
      [characterId],
    );
    const allowedMasteryItems = new Set([
      ...Object.keys(defaultProgression().mastery),
      ...Object.keys(currentMastery),
      ...inventoryRows.rows
        .filter((item) => ['sword', 'gun', 'style', 'fruit'].includes(String(jsonRecord(item.metadata_json).kind)))
        .map((item) => item.item_id),
    ]);
    for (const itemId of Object.keys(proposed.mastery)) {
      if (!allowedMasteryItems.has(itemId)) {
        throw new PlayerDocumentValidationError(`Client mastery item '${itemId}' is not owned`);
      }
    }
    const [monsterBudget, questBudget] = await Promise.all([
      client.query<{ total: string }>(
        'select coalesce(sum(mastery_exp), 0)::text as total from monster_kill_batches where character_id = $1',
        [characterId],
      ),
      client.query<{ total: string }>(
        'select coalesce(sum(mastery_bonus), 0)::text as total from quest_claims where character_id = $1',
        [characterId],
      ),
    ]);
    const earnedBudget = numberFromBigint(monsterBudget.rows[0]?.total ?? 0)
      + numberFromBigint(questBudget.rows[0]?.total ?? 0);
    const currentMasteryTotal = totalMasteryExp(currentMastery);
    const proposedMasteryTotal = totalMasteryExp(proposed.mastery);
    // Grandfather a migrated legacy baseline, but never let it grow without new
    // server-recorded rewards. Fresh online characters are bounded by all receipts.
    if (proposedMasteryTotal > Math.max(currentMasteryTotal, earnedBudget)) {
      throw new PlayerDocumentValidationError('Client mastery exceeds Server-issued reward budget');
    }
    return {
      ...proposed,
      level: characterRow.level,
      exp: numberFromBigint(row?.exp ?? 0),
      coins: numberFromBigint(characterRow.coins),
      statPoints: proposed.statPoints,
      stats: proposed.stats,
    };
  }

  /**
   * Acquisition is Server-owned. A normal save may equip owned items, change quickslots,
   * or consume potions, but it cannot add/remove permanent items or increase consumables.
   */
  private async authoritativeInventory(
    client: PoolClient,
    characterId: string,
    proposed: CanonicalInventory,
    legacyLoadout: CanonicalLegacyLoadout,
  ): Promise<CanonicalInventory> {
    const result = await client.query<{
      item_id: string;
      quantity: number;
      metadata_json: unknown;
    }>(
      'select item_id, quantity, metadata_json from player_inventory where character_id = $1 for update',
      [characterId],
    );
    const owned = {
      sword: [] as string[],
      gun: [] as string[],
      style: ['combat'],
      fruit: [] as string[],
    };
    const consumables: Record<string, number> = {};
    for (const row of result.rows) {
      const kind = jsonRecord(row.metadata_json).kind;
      if (kind === 'consumable') consumables[row.item_id] = row.quantity;
      else if (kind === 'sword') owned.sword.push(row.item_id);
      else if (kind === 'gun') owned.gun.push(row.item_id);
      else if (kind === 'style' && row.item_id !== 'combat') owned.style.push(row.item_id);
      else if (kind === 'fruit') owned.fruit.push(row.item_id);
    }
    if (
      !sameIds(owned.sword, proposed.ownedSwords)
      || !sameIds(owned.gun, proposed.ownedGuns)
      || !sameIds(owned.style, proposed.ownedStyles)
      || !sameIds(owned.fruit, proposed.ownedFruits)
    ) {
      throw new PlayerDocumentValidationError('Client inventory ownership differs from Server inventory');
    }
    for (const [itemId, quantity] of Object.entries(proposed.consumables)) {
      if (quantity > (consumables[itemId] ?? 0)) {
        throw new PlayerDocumentValidationError(`Client cannot increase consumable '${itemId}'`);
      }
    }

    const owns = (kind: 'sword' | 'gun' | 'style' | 'fruit', itemId: string | null): boolean => (
      itemId === null || owned[kind].includes(itemId)
    );
    const loadout = proposed.loadout;
    if (
      !owns('sword', loadout.equippedSwordId)
      || !owns('gun', loadout.equippedGunId)
      || !owns('style', loadout.equippedFightingStyleId)
      || !owns('fruit', loadout.equippedFruitId)
    ) {
      throw new PlayerDocumentValidationError('Client equipped an item it does not own');
    }
    const legacyKinds = { style: 'style', sword: 'sword', gun: 'gun', fruit: 'fruit' } as const;
    for (const [slot, kind] of Object.entries(legacyKinds)) {
      const itemId = legacyLoadout.slots[slot as keyof typeof legacyKinds] ?? null;
      const builtIn = itemId === 'basic-brawl' || itemId === 'training-sword';
      if (!builtIn && !owns(kind, itemId)) {
        throw new PlayerDocumentValidationError('Legacy loadout contains an unowned item');
      }
    }
    const nextConsumables = Object.fromEntries(
      Object.entries(consumables)
        .map(([itemId]) => [itemId, proposed.consumables[itemId] ?? 0] as const)
        .filter(([, quantity]) => quantity > 0),
    );
    return {
      ...proposed,
      ownedSwords: owned.sword,
      ownedGuns: owned.gun,
      ownedStyles: owned.style,
      ownedFruits: owned.fruit,
      consumables: nextConsumables,
    };
  }

  private async persistCheckpoint(
    client: PoolClient,
    characterId: string,
    checkpoint: CanonicalCheckpoint,
    progression: CanonicalProgression,
  ): Promise<void> {
    const caps = canonicalResourceCaps(progression);
    await client.query(
      `insert into player_stats
        (character_id, hp, max_hp, mp, max_mp, energy, max_energy, derived_json, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,'{}'::jsonb,now())
       on conflict (character_id) do update set
         hp = excluded.hp, max_hp = excluded.max_hp,
         mp = excluded.mp, max_mp = excluded.max_mp,
         energy = excluded.energy, max_energy = excluded.max_energy,
         updated_at = now()`,
      [
        characterId,
        checkpoint.hp,
        caps.maxHp,
        checkpoint.mp,
        caps.maxMp,
        checkpoint.energy,
        caps.maxEnergy,
      ],
    );
    await client.query(
      `insert into player_checkpoints
        (character_id, island_id, spawn_id, position_json, heading,
         camera_yaw, world_time, schema_version, saved_at)
       values ($1,$2,$3,$4::jsonb,$5,$6,$7,1,now())
       on conflict (character_id) do update set
         island_id = excluded.island_id, spawn_id = excluded.spawn_id,
         position_json = excluded.position_json, heading = excluded.heading,
         camera_yaw = excluded.camera_yaw, world_time = excluded.world_time,
         schema_version = excluded.schema_version, saved_at = now()`,
      [
        characterId,
        checkpoint.islandId,
        checkpoint.spawnId,
        JSON.stringify(checkpoint.position),
        checkpoint.heading,
        checkpoint.cameraYaw,
        checkpoint.worldTime,
      ],
    );
    await client.query(
      `update characters
          set current_island_id = $2, spawn_id = $3, updated_at = now()
        where id = $1`,
      [characterId, checkpoint.islandId, checkpoint.spawnId],
    );
  }

  private async persistInventory(
    client: PoolClient,
    characterId: string,
    inventory: CanonicalInventory,
    legacyLoadout: CanonicalLegacyLoadout,
  ): Promise<void> {
    await client.query('delete from player_inventory where character_id = $1', [characterId]);
    const items: Array<{ id: string; quantity: number; kind: string; metadata?: Record<string, unknown> }> = [
      ...inventory.ownedSwords.map((id) => ({ id, quantity: 1, kind: 'sword' })),
      ...inventory.ownedGuns.map((id) => ({ id, quantity: 1, kind: 'gun' })),
      ...inventory.ownedStyles.map((id) => ({ id, quantity: 1, kind: 'style' })),
      ...inventory.ownedFruits.map((id) => ({ id, quantity: 1, kind: 'fruit' })),
      ...Object.entries(inventory.consumables).map(([id, quantity]) => ({
        id,
        quantity,
        kind: 'consumable',
      })),
      {
        id: '__inventory_meta__',
        quantity: 1,
        kind: 'metadata',
        metadata: { quickslots: inventory.quickslots },
      },
    ];
    const uniqueItems = new Map(items.map((item) => [item.id, item]));
    for (const item of uniqueItems.values()) {
      await client.query(
        `insert into player_inventory
          (character_id, item_id, quantity, metadata_json, updated_at)
         values ($1,$2,$3,$4::jsonb,now())`,
        [
          characterId,
          item.id,
          item.quantity,
          JSON.stringify({ kind: item.kind, ...item.metadata }),
        ],
      );
    }

    await client.query('delete from player_equipment where character_id = $1', [characterId]);
    await client.query(
      `insert into player_equipment
        (character_id, slot, item_id, metadata_json, updated_at)
       values ($1,'state','loadout',$2::jsonb,now())`,
      [
        characterId,
        JSON.stringify({
          inventoryLoadout: inventory.loadout,
          legacyLoadout,
        }),
      ],
    );
  }

  private async persistBoats(
    client: PoolClient,
    characterId: string,
    boats: CanonicalBoat[],
  ): Promise<void> {
    const existing = await client.query<{ id: string; boat_definition_id: BoatDefinitionId }>(
      'select id, boat_definition_id from player_boats where character_id = $1',
      [characterId],
    );
    const ids = new Map(existing.rows.map((boat) => [boat.boat_definition_id, boat.id]));
    if (boats.length === 0) {
      // An old Client can own cargo before it has persisted BoatProgress. Keep any
      // server-created fallback boat so a later progression save cannot cascade-delete cargo.
      return;
    }
    await client.query('update player_boats set is_active = false where character_id = $1', [characterId]);
    await client.query(
      `delete from player_boats
        where character_id = $1
          and not (boat_definition_id = any($2::varchar[]))`,
      [characterId, boats.map((boat) => boat.definitionId)],
    );
    for (const boat of boats) {
      const id = ids.get(boat.definitionId) ?? randomUUID();
      await client.query(
        `insert into player_boats
          (id, character_id, boat_definition_id, name, level, hp, max_hp,
           cargo_capacity, upgrades_json, is_active, updated_at)
         values ($1,$2,$3,$4,1,$5,$5,$6,$7::jsonb,$8,now())
         on conflict (character_id, boat_definition_id) do update set
           name = excluded.name, hp = excluded.hp, max_hp = excluded.max_hp,
           cargo_capacity = excluded.cargo_capacity,
           upgrades_json = excluded.upgrades_json,
           is_active = excluded.is_active, updated_at = now()`,
        [
          id,
          characterId,
          boat.definitionId,
          boat.name,
          boat.maxHp,
          boat.cargoCapacity,
          JSON.stringify(boat.upgrades),
          boat.active,
        ],
      );
    }
  }

  private async persistCargo(
    client: PoolClient,
    characterId: string,
    cargo: CanonicalCargo,
  ): Promise<void> {
    await client.query('delete from player_cargo where character_id = $1', [characterId]);
    if (cargo.slots.length === 0) return;
    let active = await client.query<{ id: string }>(
      `select id from player_boats
        where character_id = $1 and is_active = true
        limit 1`,
      [characterId],
    );
    if (!active.rows[0]) {
      const definition = canonicalBoatData('training-dinghy');
      await client.query('update player_boats set is_active = false where character_id = $1', [characterId]);
      await client.query(
        `insert into player_boats
          (id, character_id, boat_definition_id, name, level, hp, max_hp,
           cargo_capacity, upgrades_json, is_active, updated_at)
         values ($1,$2,'training-dinghy',$3,1,$4,$4,$5,'{}'::jsonb,true,now())
         on conflict (character_id, boat_definition_id) do update set
           is_active = true, updated_at = now()`,
        [randomUUID(), characterId, definition.name, definition.maxHp, definition.cargoCapacity],
      );
      active = await client.query<{ id: string }>(
        `select id from player_boats
          where character_id = $1 and is_active = true
          limit 1`,
        [characterId],
      );
    }
    const boatId = active.rows[0]!.id;
    for (const slot of cargo.slots) {
      await client.query(
        `insert into player_cargo
          (character_id, boat_id, commodity_id, quantity, updated_at)
         values ($1,$2,$3,$4,now())`,
        [characterId, boatId, slot.commodityId, slot.quantity],
      );
    }
  }

  private async persistQuests(
    client: PoolClient,
    characterId: string,
    progression: CanonicalProgression,
  ): Promise<void> {
    await client.query('delete from player_quests where character_id = $1', [characterId]);
    for (const questId of progression.completedQuestIds) {
      await client.query(
        `insert into player_quests
          (character_id, quest_id, status, progress_json, accepted_at,
           completed_at, updated_at)
         values ($1,$2,'completed','{}'::jsonb,now(),now(),now())`,
        [characterId, questId],
      );
    }
    if (progression.activeQuestId) {
      await client.query(
        `insert into player_quests
          (character_id, quest_id, status, progress_json, accepted_at, updated_at)
         values ($1,$2,'active',$3::jsonb,now(),now())
         on conflict (character_id, quest_id) do update set
           status = 'active', progress_json = excluded.progress_json,
           completed_at = null, updated_at = now()`,
        [
          characterId,
          progression.activeQuestId,
          JSON.stringify({ objectives: progression.activeQuestProgress }),
        ],
      );
    }
  }
}
