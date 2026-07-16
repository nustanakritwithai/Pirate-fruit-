# Pirate Fruit Server — S2 foundation

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

S2 does not own gameplay state yet. Session, repositories, economy, trade,
quests, combat, and multiplayer authority remain disabled for later phases.
