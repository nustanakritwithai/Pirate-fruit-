# Pirate Fruit Database Schema

Phase S7 activates the existing economy world/snapshot tables without changing the
additive S6 schema version 2. Production Remote Save and Remote Economy remain disabled
until Render integration verification.

## Tooling and source of truth

- Typed schema: `server/src/persistence/schema.ts`
- Drizzle config: `server/drizzle.config.ts`
- Forward migration: `server/drizzle/0000_s4_core_schema.sql`
- Reverse migration: `server/drizzle/rollback/0000_s4_core_schema.down.sql`
- S6 migration: `server/drizzle/0001_s6_remote_player_save.sql`
- S6 reverse migration: `server/drizzle/rollback/0001_s6_remote_player_save.down.sql`
- Application version: `schema_migrations.version = 2`
- Migration integrity: SHA-256 of the committed forward SQL

Drizzle's `drizzle.__drizzle_migrations` table answers whether SQL ran. The
application-owned `schema_migrations` table answers which Pirate Fruit schema
version is supported and rejects a changed migration checksum. Never edit an
applied migration; add a new migration and increment the application version.

## Tables

| Table | Responsibility | Important invariant/index |
| --- | --- | --- |
| `users` | Account root | Valid status only |
| `sessions` | Hashed, expiring sessions | Unique `token_hash`; expiry/user indexes |
| `characters` | Name, level, coins, island and spawn | Non-negative coins; unique name per user |
| `player_progression` | EXP, stat allocation and mastery | Non-negative progression values |
| `player_stats` | Current/max HP, MP and Energy | Current values cannot exceed maxima |
| `player_inventory` | Item quantities and metadata | Unique character/item pair |
| `player_equipment` | Equipped item per slot | Unique character/slot pair |
| `player_boats` | Owned boats, upgrades and capacity | One active boat per character |
| `player_cargo` | Commodities carried by a boat | Cargo character must own the referenced boat |
| `player_quests` | Quest status, progress and cooldown | Unique character/quest pair |
| `player_checkpoints` | Current island spawn and position | One checkpoint per character |
| `economy_worlds` | Current durable world economy | Non-negative monotonic tick |
| `economy_snapshots` | Crash-recovery history | Unique world/tick pair |
| `trade_transactions` | Immutable trade audit rows | Unique character/idempotency key |
| `schema_migrations` | Application schema ledger | Unique version and migration name |
| `player_save_operations` | Save idempotency/revision ledger | Unique character/key; immutable resulting revision |

S6 adds `characters.save_revision`, `characters.local_save_migrated_at`, progression
`mana`, and checkpoint heading/camera/world-time fields. Each mutation locks the
character row, compares the expected revision, updates all affected tables and writes
the operation ledger in one transaction. Any partial failure rolls the transaction back.

JSONB is reserved for evolving nested documents such as mastery, upgrades,
quest objectives and economy snapshots. Identity, ownership, balances,
quantities, prices and lookup fields remain normalized and constrained.

## S7 economy durability

- `economy_worlds.id = 'main'` is the canonical current document and monotonic tick.
- One Server process holds a dedicated PostgreSQL advisory lock before it may tick.
  Other instances are read-only followers and serve the same database row.
- Every 5 seconds the leader runs the existing Living Economy kernel, locks the world
  row with `SELECT ... FOR UPDATE`, rejects a database tick newer than memory, and updates
  state plus `last_tick_at` in one transaction.
- Every 12 ticks (one minute) the same transaction inserts an idempotent
  `economy_snapshots` row. Retention is capped at the newest 120 snapshots.
- Startup derives missed ticks from Server-owned `last_tick_at`, never a Client timestamp,
  and simulates at most 12 missed ticks. This bounds restart CPU and offline inflation.
- A failed state/snapshot write rolls back, releases leadership, discards the advanced
  in-memory engine and reloads PostgreSQL before another write attempt.

The S4 placeholder seed is detected as a non-gameplay document and replaced by a valid
fresh world only after a process acquires leadership. The seed remains idempotent and
never overwrites an already running economy.

## Commands

From the repository root:

```bash
# Generate a new migration after changing schema.ts
npm run db:generate

# Local development (runs TypeScript directly)
DATABASE_URL=postgresql://pirate_fruit:pirate_fruit@localhost:5432/pirate_fruit npm run db:migrate:dev
DATABASE_URL=postgresql://pirate_fruit:pirate_fruit@localhost:5432/pirate_fruit npm run db:seed:dev

# Built production commands
npm run build:server
DATABASE_URL=postgresql://... npm run db:migrate
DATABASE_URL=postgresql://... npm run db:seed
```

The seed creates only the empty `main` economy world and uses `ON CONFLICT DO
NOTHING`. It never replaces a running world's state.

## Rollback

The S4 rollback drops all S4 tables and therefore destroys server-side data. It
is intended only before remote systems are enabled or after restoring a database
backup. The command refuses to run without an exact confirmation:

```bash
DATABASE_URL=postgresql://... \
DATABASE_ROLLBACK_CONFIRM=rollback-s4-core \
npm run db:rollback
```

Disable all remote feature flags first. In any environment containing player
data, take and verify a PostgreSQL backup before executing rollback.

## Database tests

Normal tests validate the migration manifest and execute the full schema against
an in-memory PostgreSQL emulator. GitHub Actions also starts PostgreSQL 16 and
runs migration, checksum, seed, ownership, check-constraint, idempotency, economy
leadership, world/snapshot transaction, stale-tick and rollback integration coverage
against the dedicated `pirate_fruit_test`
database. The test refuses to reset a database whose name does not end in
`_test`.


## S8 notes
- `trade_transactions` เริ่มถูกเขียนจริงโดย `/api/trade/execute` (audit + idempotency ledger); `metadata_json` เก็บ request hash + ผลลัพธ์สำหรับ idempotent replay
- ไม่มี migration ใหม่ใน S8 — ใช้ตาราง S4/S6 เดิมทั้งหมด (`characters.coins`, `player_cargo`, `player_boats.is_active`, `trade_transactions`)
- Retention: sessions หมดอายุ > 7 วัน และ orphan guest users > 45 วัน ถูกลบโดย cleanup job (cascade ลบ characters/sessions ของ guest นั้น)


## S10 notes
- Migration `0002_s10_quest_claims` (schema version 3): ตารางใหม่ `quest_claims` — audit การเคลมรางวัลเควสต์ + idempotency ledger (unique `(character_id, idempotency_key)`, เก็บ request hash, เลขรางวัล และ `coins_after`)
- `player_quests` (มีตั้งแต่ S4) เริ่มถูกใช้จริง: หนึ่งแถวต่อ (ตัวละคร, เควสต์), `status` = active → completed → claimed (หรือ abandoned), `progress_json = {"objectives": number[]}`
- Rollback: `drizzle/rollback/0002_s10_quest_claims.down.sql` (drop `quest_claims` อย่างเดียว — `player_quests` เป็นของ S4)
