# Pirate Fruit Server Architecture

## Decision

Pirate Fruit uses a Node.js + TypeScript modular monolith built with Fastify.
PostgreSQL access starts with the `pg` driver; Drizzle migrations and domain
repositories are introduced in S4 after persistence interfaces are locked.

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
