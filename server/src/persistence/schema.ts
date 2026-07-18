import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    status: text('status').default('active').notNull(),
  },
  (table) => [
    index('users_status_idx').on(table.status),
    check('users_status_check', sql`${table.status} in ('active', 'suspended', 'deleted')`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 128 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ipHash: varchar('ip_hash', { length: 128 }),
    userAgent: varchar('user_agent', { length: 512 }),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_uq').on(table.tokenHash),
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
);

export const characters = pgTable(
  'characters',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 64 }).notNull(),
    level: integer('level').default(1).notNull(),
    coins: bigint('coins', { mode: 'bigint' }).default(sql`0`).notNull(),
    currentIslandId: varchar('current_island_id', { length: 96 }).notNull(),
    spawnId: varchar('spawn_id', { length: 96 }).notNull(),
    saveRevision: bigint('save_revision', { mode: 'bigint' }).default(sql`0`).notNull(),
    localSaveMigratedAt: timestamp('local_save_migrated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('characters_user_name_uq').on(table.userId, table.name),
    index('characters_user_id_idx').on(table.userId),
    index('characters_current_island_idx').on(table.currentIslandId),
    check('characters_level_check', sql`${table.level} >= 1`),
    check('characters_coins_check', sql`${table.coins} >= 0`),
    check('characters_save_revision_check', sql`${table.saveRevision} >= 0`),
  ],
);

export const playerProgression = pgTable(
  'player_progression',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    exp: bigint('exp', { mode: 'bigint' }).default(sql`0`).notNull(),
    statPoints: integer('stat_points').default(0).notNull(),
    combat: integer('combat').default(0).notNull(),
    vitality: integer('vitality').default(0).notNull(),
    blade: integer('blade').default(0).notNull(),
    ranged: integer('ranged').default(0).notNull(),
    fruitPower: integer('fruit_power').default(0).notNull(),
    mana: integer('mana').default(1).notNull(),
    masteryJson: jsonb('mastery_json').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('player_progression_level_lookup_idx').on(table.exp),
    check('player_progression_exp_check', sql`${table.exp} >= 0`),
    check('player_progression_stat_points_check', sql`${table.statPoints} >= 0`),
    check(
      'player_progression_stats_check',
      sql`${table.combat} >= 0 and ${table.vitality} >= 0 and ${table.blade} >= 0 and ${table.ranged} >= 0 and ${table.fruitPower} >= 0 and ${table.mana} >= 0`,
    ),
  ],
);

export const playerStats = pgTable(
  'player_stats',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    hp: integer('hp').notNull(),
    maxHp: integer('max_hp').notNull(),
    mp: integer('mp').notNull(),
    maxMp: integer('max_mp').notNull(),
    energy: integer('energy').notNull(),
    maxEnergy: integer('max_energy').notNull(),
    derivedJson: jsonb('derived_json').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      'player_stats_vitals_check',
      sql`${table.maxHp} > 0 and ${table.hp} >= 0 and ${table.hp} <= ${table.maxHp} and ${table.maxMp} >= 0 and ${table.mp} >= 0 and ${table.mp} <= ${table.maxMp} and ${table.maxEnergy} >= 0 and ${table.energy} >= 0 and ${table.energy} <= ${table.maxEnergy}`,
    ),
  ],
);

export const playerInventory = pgTable(
  'player_inventory',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    itemId: varchar('item_id', { length: 128 }).notNull(),
    quantity: integer('quantity').notNull(),
    metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('player_inventory_character_item_uq').on(table.characterId, table.itemId),
    index('player_inventory_item_idx').on(table.itemId),
    check('player_inventory_quantity_check', sql`${table.quantity} >= 0`),
  ],
);

export const playerEquipment = pgTable(
  'player_equipment',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    slot: varchar('slot', { length: 64 }).notNull(),
    itemId: varchar('item_id', { length: 128 }).notNull(),
    metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('player_equipment_character_slot_uq').on(table.characterId, table.slot),
    index('player_equipment_item_idx').on(table.itemId),
  ],
);

export const playerBoats = pgTable(
  'player_boats',
  {
    id: uuid('id').primaryKey(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    boatDefinitionId: varchar('boat_definition_id', { length: 128 }).notNull(),
    name: varchar('name', { length: 96 }).notNull(),
    level: integer('level').default(1).notNull(),
    hp: integer('hp').notNull(),
    maxHp: integer('max_hp').notNull(),
    cargoCapacity: integer('cargo_capacity').notNull(),
    upgradesJson: jsonb('upgrades_json').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
    isActive: boolean('is_active').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('player_boats_character_definition_uq').on(
      table.characterId,
      table.boatDefinitionId,
    ),
    unique('player_boats_id_character_uq').on(table.id, table.characterId),
    uniqueIndex('player_boats_one_active_uq')
      .on(table.characterId)
      .where(sql`${table.isActive} = true`),
    index('player_boats_character_idx').on(table.characterId),
    check('player_boats_level_check', sql`${table.level} >= 1`),
    check(
      'player_boats_vitals_check',
      sql`${table.maxHp} > 0 and ${table.hp} >= 0 and ${table.hp} <= ${table.maxHp} and ${table.cargoCapacity} >= 0`,
    ),
  ],
);

export const playerCargo = pgTable(
  'player_cargo',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    boatId: uuid('boat_id').notNull(),
    commodityId: varchar('commodity_id', { length: 128 }).notNull(),
    quantity: integer('quantity').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('player_cargo_character_boat_commodity_uq').on(
      table.characterId,
      table.boatId,
      table.commodityId,
    ),
    foreignKey({
      name: 'player_cargo_boat_owner_fk',
      columns: [table.boatId, table.characterId],
      foreignColumns: [playerBoats.id, playerBoats.characterId],
    }).onDelete('cascade'),
    index('player_cargo_boat_idx').on(table.boatId),
    index('player_cargo_commodity_idx').on(table.commodityId),
    check('player_cargo_quantity_check', sql`${table.quantity} >= 0`),
  ],
);

export const playerQuests = pgTable(
  'player_quests',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    questId: varchar('quest_id', { length: 128 }).notNull(),
    status: text('status').default('active').notNull(),
    progressJson: jsonb('progress_json').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    repeatAvailableAt: timestamp('repeat_available_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('player_quests_character_quest_uq').on(table.characterId, table.questId),
    index('player_quests_character_status_idx').on(table.characterId, table.status),
    check(
      'player_quests_status_check',
      sql`${table.status} in ('active', 'completed', 'claimed', 'abandoned')`,
    ),
  ],
);

export const playerCheckpoints = pgTable(
  'player_checkpoints',
  {
    characterId: uuid('character_id')
      .primaryKey()
      .references(() => characters.id, { onDelete: 'cascade' }),
    islandId: varchar('island_id', { length: 96 }).notNull(),
    spawnId: varchar('spawn_id', { length: 96 }).notNull(),
    positionJson: jsonb('position_json').$type<{ x: number; y: number; z: number }>().notNull(),
    heading: doublePrecision('heading').default(0).notNull(),
    cameraYaw: doublePrecision('camera_yaw').default(0).notNull(),
    worldTime: doublePrecision('world_time').default(0.31).notNull(),
    schemaVersion: integer('schema_version').default(1).notNull(),
    savedAt: timestamp('saved_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('player_checkpoints_island_spawn_idx').on(table.islandId, table.spawnId)],
);

export const playerSaveOperations = pgTable(
  'player_save_operations',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    operation: text('operation').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    resultingRevision: bigint('resulting_revision', { mode: 'bigint' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('player_save_operations_character_key_uq').on(
      table.characterId,
      table.idempotencyKey,
    ),
    index('player_save_operations_character_created_idx').on(
      table.characterId,
      table.createdAt.desc(),
    ),
    check(
      'player_save_operations_operation_check',
      sql`${table.operation} in ('save', 'checkpoint', 'cargo', 'migration')`,
    ),
    check(
      'player_save_operations_revision_check',
      sql`${table.resultingRevision} >= 1`,
    ),
  ],
);

export const economyWorlds = pgTable(
  'economy_worlds',
  {
    id: varchar('id', { length: 96 }).primaryKey(),
    version: integer('version').notNull(),
    tick: bigint('tick', { mode: 'bigint' }).default(sql`0`).notNull(),
    stateJson: jsonb('state_json').$type<Record<string, unknown>>().notNull(),
    lastTickAt: timestamp('last_tick_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('economy_worlds_version_check', sql`${table.version} >= 1`),
    check('economy_worlds_tick_check', sql`${table.tick} >= 0`),
  ],
);

export const economySnapshots = pgTable(
  'economy_snapshots',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    worldId: varchar('world_id', { length: 96 })
      .notNull()
      .references(() => economyWorlds.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    tick: bigint('tick', { mode: 'bigint' }).notNull(),
    stateJson: jsonb('state_json').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('economy_snapshots_world_tick_uq').on(table.worldId, table.tick),
    index('economy_snapshots_world_created_idx').on(table.worldId, table.createdAt.desc()),
    check('economy_snapshots_version_check', sql`${table.version} >= 1`),
    check('economy_snapshots_tick_check', sql`${table.tick} >= 0`),
  ],
);

export const tradeTransactions = pgTable(
  'trade_transactions',
  {
    id: uuid('id').primaryKey(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'restrict' }),
    action: text('action').notNull(),
    islandId: varchar('island_id', { length: 96 }).notNull(),
    commodityId: varchar('commodity_id', { length: 128 }).notNull(),
    quantity: integer('quantity').notNull(),
    unitPrice: numeric('unit_price', { precision: 20, scale: 4 }).notNull(),
    fee: numeric('fee', { precision: 20, scale: 4 }).default('0').notNull(),
    total: numeric('total', { precision: 20, scale: 4 }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('trade_transactions_character_idempotency_uq').on(
      table.characterId,
      table.idempotencyKey,
    ),
    index('trade_transactions_character_created_idx').on(
      table.characterId,
      table.createdAt.desc(),
    ),
    index('trade_transactions_market_created_idx').on(
      table.islandId,
      table.commodityId,
      table.createdAt.desc(),
    ),
    check('trade_transactions_action_check', sql`${table.action} in ('buy', 'sell', 'import')`),
    check('trade_transactions_quantity_check', sql`${table.quantity} > 0`),
    check(
      'trade_transactions_money_check',
      sql`${table.unitPrice} >= 0 and ${table.fee} >= 0 and ${table.total} >= 0`,
    ),
  ],
);

export const questClaims = pgTable(
  'quest_claims',
  {
    id: uuid('id').primaryKey(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    questId: varchar('quest_id', { length: 128 }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    playerExp: integer('player_exp').notNull(),
    coins: integer('coins').notNull(),
    masteryBonus: integer('mastery_bonus').default(0).notNull(),
    coinsAfter: bigint('coins_after', { mode: 'bigint' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('quest_claims_character_idempotency_uq').on(
      table.characterId,
      table.idempotencyKey,
    ),
    index('quest_claims_character_created_idx').on(table.characterId, table.createdAt.desc()),
    index('quest_claims_quest_idx').on(table.questId),
    check(
      'quest_claims_reward_check',
      sql`${table.playerExp} >= 0 and ${table.coins} >= 0 and ${table.masteryBonus} >= 0 and ${table.coinsAfter} >= 0`,
    ),
  ],
);

export const monsterKillBatches = pgTable(
  'monster_kill_batches',
  {
    id: uuid('id').primaryKey(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    killsJson: jsonb('kills_json').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
    killCount: integer('kill_count').default(0).notNull(),
    playerExp: integer('player_exp').notNull(),
    masteryExp: integer('mastery_exp').notNull(),
    coins: integer('coins').notNull(),
    coinsAfter: bigint('coins_after', { mode: 'bigint' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('monster_kill_batches_character_idempotency_uq').on(
      table.characterId,
      table.idempotencyKey,
    ),
    index('monster_kill_batches_character_created_idx').on(
      table.characterId,
      table.createdAt.desc(),
    ),
    check(
      'monster_kill_batches_reward_check',
      sql`${table.playerExp} >= 0 and ${table.masteryExp} >= 0 and ${table.coins} >= 0 and ${table.coinsAfter} >= 0`,
    ),
  ],
);

// S16 — สถานะมอนสเตอร์กลาง (restart recovery): HP/state/ตำแหน่ง/เวลาเกิดใหม่ต่อ spawn
export const worldMonsterState = pgTable('world_monster_state', {
  spawnId: varchar('spawn_id', { length: 96 }).primaryKey(),
  islandId: varchar('island_id', { length: 96 }).notNull(),
  monsterId: varchar('monster_id', { length: 96 }).notNull(),
  hp: integer('hp').notNull(),
  state: varchar('state', { length: 24 }).notNull(),
  x: real('x').notNull(),
  z: real('z').notNull(),
  respawnAt: bigint('respawn_at', { mode: 'number' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// S17 — authoritative boat entity persisted independently from client presence.
export const worldBoatState = pgTable(
  'world_boat_state',
  {
    boatId: uuid('boat_id').primaryKey().references(() => playerBoats.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
    definitionId: varchar('definition_id', { length: 128 }).notNull(),
    islandId: varchar('island_id', { length: 96 }).notNull(),
    x: real('x').notNull(),
    z: real('z').notNull(),
    heading: real('heading').notNull(),
    speed: real('speed').default(0).notNull(),
    hp: integer('hp').notNull(),
    maxHp: integer('max_hp').notNull(),
    anchor: boolean('anchor').default(true).notNull(),
    state: varchar('state', { length: 24 }).default('docked').notNull(),
    helmId: uuid('helm_id').references(() => characters.id, { onDelete: 'set null' }),
    passengerIds: jsonb('passenger_ids').$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    respawnAt: bigint('respawn_at', { mode: 'number' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('world_boat_island_idx').on(table.islandId),
    index('world_boat_owner_idx').on(table.ownerId),
    check('world_boat_vitals_check', sql`${table.maxHp} > 0 and ${table.hp} >= 0 and ${table.hp} <= ${table.maxHp}`),
    check('world_boat_state_check', sql`${table.state} in ('docked', 'sailing', 'sunk', 'respawning')`),
  ],
);

export const schemaMigrations = pgTable(
  'schema_migrations',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    version: integer('version').notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    checksum: varchar('checksum', { length: 128 }).notNull(),
    appliedAt: timestamp('applied_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('schema_migrations_version_uq').on(table.version),
    uniqueIndex('schema_migrations_name_uq').on(table.name),
    check('schema_migrations_version_check', sql`${table.version} >= 1`),
  ],
);

export type UserRecord = typeof users.$inferSelect;
export type CharacterRecord = typeof characters.$inferSelect;
export type EconomyWorldRecord = typeof economyWorlds.$inferSelect;
export type TradeTransactionRecord = typeof tradeTransactions.$inferSelect;
export type PlayerSaveOperationRecord = typeof playerSaveOperations.$inferSelect;
