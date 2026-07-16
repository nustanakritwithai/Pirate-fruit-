# Pirate Fruit Server

Fastify modular-monolith foundation for the Render Web Service.

Available endpoints:

- `GET /health` — process liveness; never waits for PostgreSQL
- `GET /ready` — readiness with PostgreSQL probe
- `GET /version` — service/shared protocol versions
- `GET /internal/status` — development-only or protected by `x-admin-secret`

Run locally from the repository root:

```bash
npm install
npm run build:shared
npm run dev:server
```

Create the local PostgreSQL database, then apply and seed the S4 schema:

```bash
DATABASE_URL=postgresql://pirate_fruit:pirate_fruit@localhost:5432/pirate_fruit npm run db:migrate:dev
DATABASE_URL=postgresql://pirate_fruit:pirate_fruit@localhost:5432/pirate_fruit npm run db:seed:dev
```

Render runs `npm run db:migrate` before every server start. Migrations are
idempotent and verify their stored checksum before the process accepts traffic.

S4 creates durable tables but does not own gameplay state yet. Session,
authoritative saves, economy, trade, quests, combat, and multiplayer remain
disabled for their corresponding phases.
