# Render Deployment

`render.yaml` defines three resources in Singapore:

1. `pirate-fruit` — existing Vite/Three.js Static Site.
2. `pirate-fruit-server` — Node.js Web Service.
3. `pirate-fruit-db` — Render PostgreSQL using its internal connection string.

## Blueprint setup

1. Sync the repository Blueprint from `render.yaml`.
2. Set `CLIENT_ORIGIN` to the exact public Static Site origin, without a trailing slash.
3. Let Render generate `SESSION_SECRET`; never copy it into the client or repository.
4. Keep remote feature flags false until their owning phase is merged.
5. Confirm all resources use Singapore before the first creation; Render regions
   cannot be changed in place later.

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
healthy deploy in Render. The Static Site remains playable in local mode because
S2 does not change client behavior or local saves.
