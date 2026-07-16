# S6 Operations Runbook

## Pre-enable checks

- GitHub Client/server gates are green for the deployed commit.
- `/health`, `/ready`, `/version` succeed and `/ready` reports PostgreSQL ready.
- Schema ledger contains versions 1 and 2 with repository checksums.
- Remote Session works across reload with one cookie jar.
- `ENABLE_REMOTE_SAVE` and `VITE_USE_REMOTE_SERVER` remain false until the staged test.

## Functional canary

Create two separate browser profiles. Migrate a distinct Local save in one, reload it,
then clear only gameplay keys and verify Server load restores it. Confirm the second
profile cannot see the first profile's state. Retry the exact migration/save request,
send a stale revision, test an invalid island/spawn checkpoint, expire/revoke a session,
and exercise offline fallback. Check that coins/items/boats/cargo counts are unchanged
by retries and that economy continues from Local storage.

## Triage

- `401`: renew the guest session; never copy session cookies into tickets.
- `409 STALE_SAVE_REVISION`: keep the Local dirty copy and investigate competing tabs.
- `409 IDEMPOTENCY_KEY_REUSED`: Client bug or key corruption; do not retry with new keys blindly.
- `422`: retain the browser backup and inspect sanitized document category, not secrets.
- readiness/database failure: disable Remote Save and follow `ROLLBACK_PLAN.md`.

Monitor rates of save success, fallback, revision conflict, migration rejection and DB
transaction errors using request IDs. Logs must continue redacting Cookie, Set-Cookie,
Authorization and CSRF headers.
