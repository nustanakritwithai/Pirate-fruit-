# Render Deployment

`render.yaml` defines three resources in Singapore:

1. `pirate-fruit` — existing Vite/Three.js Static Site.
2. `pirate-fruit-server` — Node.js Web Service.
3. `pirate-fruit-db` — Render PostgreSQL using its internal connection string.

## Blueprint setup

1. Sync the repository Blueprint from `render.yaml`.
2. The Static Site builds from the repository root because `client` consumes the
   `shared` workspace; the root `package-lock.json` is canonical and publish output
   remains `client/dist`.
3. Set `CLIENT_ORIGIN` to the exact public Static Site origin, without a trailing slash.
4. Set `VITE_API_URL` and `VITE_WS_URL` to the public server origins, but keep
   `VITE_USE_REMOTE_SERVER=false` through S3.
5. Let Render generate `SESSION_SECRET`; never copy it into the client or repository.
6. Keep remote feature flags false until their owning phase is merged.
7. Confirm all resources use Singapore before the first creation; Render regions
   cannot be changed in place later.
8. The Web Service start command runs `npm run db:migrate` before starting
   Fastify. A checksum or migration failure prevents the service from accepting
   traffic with a partially upgraded schema.

## First database seed

After the first successful schema migration, open a one-off Render shell for the
Web Service and run:

```bash
npm run db:seed
```

The seed is idempotent and creates only the empty `main` economy world. Do not
put the seed command in every deploy because S7 will own live economy recovery.

## Verification

After the Web Service deploys, verify:

```bash
curl -fsS https://<server-domain>/health
curl -fsS https://<server-domain>/ready
curl -fsS https://<server-domain>/version
```

Expected behavior:

- `/health` returns HTTP 200 whenever the process is alive.
- `/ready` returns HTTP 200 with `database: ready` after PostgreSQL connects.
- `/ready` returns HTTP 503 without exposing database credentials on failure.

## Rollback

Disable all remote feature flags first. Roll the server service back to its last
healthy deploy in Render. Set `VITE_USE_REMOTE_SERVER=false` and redeploy the Static
Site to force local repositories. S3 preserves all existing save keys and document
formats, so this does not require data conversion.

Do not run the destructive S4 down migration against a database containing live
player data. Restore a verified PostgreSQL backup instead. The explicit down
command and confirmation value are documented in `DATABASE_SCHEMA.md` for
pre-production recovery only.
