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
   `VITE_USE_REMOTE_SERVER=false` until S6 integration verification and
   `VITE_ENABLE_REMOTE_SESSION=false` until S5 verification finishes.
5. Let Render generate `SESSION_SECRET`; never copy it into the client or repository.
6. Keep remote feature flags false until their owning phase is merged.
7. Confirm all resources use Singapore before the first creation; Render regions
   cannot be changed in place later.
8. The Web Service start command runs `npm run db:migrate` before starting
   Fastify. A checksum or migration failure prevents the service from accepting
   traffic with a partially upgraded schema.

## Enable S5 guest sessions

1. Deploy the Server with `ENABLE_REMOTE_SESSION=false` and verify health,
   readiness and database migration.
2. Confirm `CLIENT_ORIGIN` exactly matches the Static Site origin.
3. Set `ENABLE_REMOTE_SESSION=true` on the Web Service and redeploy.
4. Verify `POST /api/session/guest` then `GET /api/session/me` retain the same IDs
   when using one cookie jar.
5. Set `VITE_ENABLE_REMOTE_SESSION=true` on the Static Site and redeploy.
6. Keep `VITE_USE_REMOTE_SERVER=false` and `ENABLE_REMOTE_SAVE=false`; S5 creates
   identity while all gameplay saves remain Local.

For maximum cookie compatibility, use same-site custom domains (for example
`game.example.com` and `api.example.com`). The default cross-site deployment uses
a Secure, `SameSite=None`, Partitioned cookie and safely falls back to Local mode
when a browser privacy policy blocks it.

## First database seed

After the first successful schema migration, open a one-off Render shell for the
Web Service and run:

```bash
npm run db:seed
```

The seed is idempotent and creates only the empty `main` economy world. Do not
put the seed command in every deploy because S7 will own live economy recovery.

## Enable S6 Remote Save

The repository contains no concrete Web Service URL and this work did not have
Render Dashboard access. Resource creation, PostgreSQL availability and public
health endpoints are therefore deployment blockers, not assumed from merged code.

1. Deploy schema version 2 with both `ENABLE_REMOTE_SAVE=false` and
   `VITE_USE_REMOTE_SERVER=false`.
2. Verify `/health`, `/ready`, `/version`, migration checksums and a PostgreSQL backup.
3. Run the cookie-jar session test and S6 integration test against a non-production account.
4. Set Web Service `ENABLE_REMOTE_SAVE=true`; keep Static Site Remote Save false.
5. Exercise migration, reload, stale revision, idempotent retry and Local fallback.
6. Set Static Site `VITE_USE_REMOTE_SERVER=true` for a limited rollout. Keep economy
   remote flags off. Monitor errors and revision conflicts before widening rollout.

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
