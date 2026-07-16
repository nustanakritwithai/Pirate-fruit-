# Local Save Migration

## S6 status

S3 introduces a persistence boundary without changing save contents or making the
server authoritative. Existing gameplay code reads a synchronous in-memory mirror;
the mirror is hydrated once from asynchronous repositories before controllers,
inventory, progression, cargo, boats, or the economy are constructed.

The default production mode remains local. S6 adds authenticated remote player and
cargo adapters. S7 adds an independently flagged, read-only shared economy adapter;
the legacy Local economy stays available as its offline fallback.

## Legacy keys preserved

| Key | Repository domain | Current document |
| --- | --- | --- |
| `pirate-fruit:save-v1` | Player | checkpoint, position, resources, world time |
| `pirate-fruit:progression-v1` | Player | level, EXP, stats, mastery, coins, quests |
| `pirate-fruit:items-v1` | Player | inventory, equipment, consumables, skill loadout |
| `pirate-fruit:boats-v1` | Player | owned/selected boats and upgrades |
| `pirate-fruit:loadout-v1` | Player | legacy combat loadout |
| `pirate-fruit:cargo-v1` | Cargo | boat cargo hold |
| `pirate-fruit:economy-v1` | Economy | living economy world snapshot |

Values remain the exact legacy JSON strings. Existing sanitizers and save-version
migrations therefore continue to run unchanged after repository hydration.
Graphics quality remains a client-only preference and intentionally stays outside
the gameplay repositories.

## Adapters

- `LocalPlayerRepository`, `LocalCargoRepository`, `LocalEconomyRepository` use the
  guarded browser storage adapter.
- `RemotePlayerRepository` and `RemoteCargoRepository` use cookie-authenticated
  requests, CSRF, an eight-second timeout and exponential retry backoff.
- `RemoteEconomyRepository` performs only `GET /api/economy/world`; browser world
  writes are rejected and temporary offline changes remain in the Local mirror.
- `RepositoryBackedStorage` presents the synchronous `getItem`/`setItem` contract
  expected by the existing game and serializes repository writes.

No UI imports database code, and no gameplay module calls browser `localStorage`
directly. Only the browser adapter and client-only graphics preference do so.

## Mode selection and fallback

```text
VITE_USE_REMOTE_SERVER=false  -> Local repositories
VITE_USE_REMOTE_SERVER=true   -> Try VITE_API_URL remote repositories
session/load/write fails      -> Keep Local copy, mark dirty, and fall back safely
```

The Render Static Site keeps both flags disabled. Remote Session and Remote Save
can be enabled independently, but Save refuses Remote mode without an online Session.
`VITE_ENABLE_ECONOMY_SERVER` is independent of both and falls back to Local without
changing player/session mode.

## One-time import

1. Load remote revision and migration status for the cookie-owned character.
2. If remote state is empty, copy all legacy player/cargo documents to
   `pirate-fruit:remote-save-backup-v1` and persist a pending idempotency marker.
3. Submit the documents. The Server strictly validates versions, IDs, numeric bounds,
   island/spawn pairing and resource caps, then writes all normalized rows in one transaction.
4. Reload and confirm the returned revision before marking migration confirmed.

A network retry reuses the pending key. Another key cannot migrate the character
again, so coins, items, boats and cargo cannot be duplicated. Gameplay keys are not
deleted by migration. Clearing them after confirmation is safe because the next load
hydrates from PostgreSQL. The backup is transitional recovery data and may be removed
manually only after Render and restore verification.

Autosaves debounce for 500 ms and batch each changed domain. The dirty marker is written
synchronously when a remote player/cargo change is enqueued, before debounce or fetch, and
is cleared only after the Server acknowledgement. This closes the page-close window: the
`pagehide` serializers always update the Local mirror first, even if the pending request
cannot finish. A failed remote write keeps that mirror, records the server revision it forked from, and
continues Local. On reconnect it uploads that dirty copy only if the server revision
is unchanged; otherwise it stays Local instead of overwriting newer data.

## Rollback

Set `VITE_USE_REMOTE_SERVER=false`. The local adapters read the same keys and exact
documents used before S3, so no data conversion or database rollback is required.
