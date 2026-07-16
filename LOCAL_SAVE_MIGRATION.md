# Local Save Migration

## S3 status

S3 introduces a persistence boundary without changing save contents or making the
server authoritative. Existing gameplay code reads a synchronous in-memory mirror;
the mirror is hydrated once from asynchronous repositories before controllers,
inventory, progression, cargo, boats, or the economy are constructed.

The default production mode remains local. Remote adapters are present for staged
integration, but authenticated endpoints and one-time import validation belong to
S5 and S6.

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
- `RemotePlayerRepository`, `RemoteCargoRepository`, `RemoteEconomyRepository` use
  cookie-authenticated HTTP requests with an eight-second timeout.
- `RepositoryBackedStorage` presents the synchronous `getItem`/`setItem` contract
  expected by the existing game and serializes repository writes.

No UI imports database code, and no gameplay module calls browser `localStorage`
directly. Only the browser adapter and client-only graphics preference do so.

## Mode selection and fallback

```text
VITE_USE_REMOTE_SERVER=false  -> Local repositories
VITE_USE_REMOTE_SERVER=true   -> Try VITE_API_URL remote repositories
remote load fails             -> Warn and fall back to Local repositories
```

The Render Static Site keeps remote mode disabled in S3. The fallback is a rollout
safety mechanism, not a security boundary. Coins, inventory, cargo, and economy are
still client-authoritative until their later server phases.

## S6 one-time import (not implemented in S3)

S6 will read these envelopes, validate schema versions and value limits on the
server, import once under an authenticated session, record an idempotent migration
marker, and retain a temporary local backup. S3 must not mark a save as migrated or
delete any legacy key.

## Rollback

Set `VITE_USE_REMOTE_SERVER=false`. The local adapters read the same keys and exact
documents used before S3, so no data conversion or database rollback is required.
