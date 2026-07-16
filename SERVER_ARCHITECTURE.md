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

S2 provides transport and operations only. It intentionally does not add login,
remote saves, economy ticks, trade authority, quests, monsters, combat, movement,
or naval multiplayer. Those remain gated by the S3–S14 sequence.
