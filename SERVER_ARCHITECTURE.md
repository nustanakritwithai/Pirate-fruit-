# Pirate Fruit Server Architecture

## Decision

Pirate Fruit uses a Node.js + TypeScript modular monolith built with Fastify.
PostgreSQL connections use `pg`, while Drizzle defines the typed S4 schema and
runs ordered SQL migrations. Domain repositories are added incrementally on top
of this database boundary from S5 onward.

Fastify was selected because it supports structured logging, schema-oriented
HTTP APIs, rate limiting, WebSocket plugins, and in-process request injection for
tests without requiring a live port. One deployable server keeps operations
simple while domain folders preserve boundaries for future extraction if needed.

## Runtime boundary

- `client/`: Three.js rendering, input, camera, animation, sound, UI, VFX, and prediction.
- `shared/`: browser-free identifiers, protocol versions, schemas, and pure validation.
- `server/`: HTTP lifecycle, sessions, authoritative state, persistence, and later WebSocket ticks.
- PostgreSQL: durable player, economy, quest, cargo, and transaction state.

The server must never import Three.js, DOM APIs, browser storage, rendering,
camera, audio, or UI modules. The client must never receive database credentials.

## S2 request lifecycle

1. Fastify assigns or accepts a request ID.
2. CORS checks the configured client origin.
3. Global rate limiting protects public routes; liveness/readiness are exempt.
4. Route handlers call injected infrastructure dependencies.
5. Errors are logged structurally and converted to a versioned safe response.
6. Runtime counters record responses without exposing player data.

`/health` is a liveness check and does not access PostgreSQL. `/ready` verifies
PostgreSQL and returns HTTP 503 when the database is unavailable. Render should
use `/health` so a temporary database incident does not create a restart loop.

## Phase boundary

S2 provides transport and operations only. S3 adds client-side persistence
interfaces and adapters, but intentionally does not make the current placeholder
remote endpoints authoritative.

## S3 persistence boundary

1. Client bootstrap selects local or remote repository adapters from configuration.
2. Player, cargo, and economy documents load asynchronously before gameplay starts.
3. A repository-backed synchronous mirror serves existing controllers and managers.
4. Writes update the mirror/local cache immediately and serialize through the
   selected repository to prevent stale remote saves winning races.
5. Remote bootstrap failure falls back to local mode while remote flags are staged.

Legacy documents remain raw JSON envelopes so all existing sanitizers and save
migrations still execute in their original domain modules. Typed server-owned
database records, authenticated identity, validated import, and authoritative
mutations remain gated by S4–S8. See `LOCAL_SAVE_MIGRATION.md`.

## S4 database boundary

- `server/src/persistence/schema.ts` is the typed schema source.
- `server/drizzle/` contains immutable forward SQL and Drizzle metadata.
- `schema_migrations` records the application schema version and SHA-256 checksum;
  Drizzle separately tracks execution in `drizzle.__drizzle_migrations`.
- Server startup applies pending migrations before opening the HTTP listener.
- Seed data is explicit and idempotent; deploys never overwrite economy state.
- Rollback requires an exact confirmation value and is limited to the S4 schema.

The schema enforces non-negative balances and stock, one row per inventory item,
one active boat per character, idempotent trade keys, and cargo ownership through
the composite `(boat_id, character_id)` foreign key. No client feature flag is
enabled by S4.

## S5 identity boundary

1. An online Client first requests `GET /api/session/me` with credentials.
2. A missing session triggers `POST /api/session/guest` exactly once per browser.
3. The Server generates a 256-bit opaque token and stores only its SHA-256 hash.
4. The raw token stays in an HttpOnly, host-only cookie; API JSON never exposes it.
5. The session resolves the user and that guest's single character from PostgreSQL.
6. Unsafe authenticated requests require a deterministic HMAC CSRF token returned
   by `guest`/`me`; logout revokes the database row immediately.

Production cookies use `Secure`, `SameSite=None`, `Partitioned`, `Path=/`, and the
`__Host-` prefix. Session creation/resume is separately feature-flagged from
remote saves, so identity can soak on Render while gameplay remains Local.
