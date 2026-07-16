# Pirate Fruit Security Model

## Trust boundary

The Browser is untrusted. Three.js, input, animation and UI remain client-side,
but identity and later authoritative state are selected from the Server session,
never from a user ID supplied in request JSON.

## Guest credential lifecycle

- The Server creates 32 random bytes using Node's cryptographic RNG.
- The Browser receives the base64url token only as an HttpOnly cookie.
- PostgreSQL stores a SHA-256 token hash, not the bearer token.
- Sessions expire after `SESSION_TTL_DAYS` (30 by default).
- Logout sets `revoked_at`; revoked and expired sessions cannot authenticate.
- Session IDs, user IDs and character IDs are server-generated UUIDs.
- Session lookup also requires an active user status.

If the database is disclosed, token hashes do not reveal the random session
tokens through a practical offline dictionary attack. A stolen live browser
cookie remains a bearer credential and must be protected by HTTPS and browser
security controls.

## Browser protections

- `HttpOnly` blocks JavaScript cookie reads.
- `Secure` prevents production cookie transmission over plain HTTP.
- The `__Host-` prefix plus no Domain attribute prevents sibling-domain cookie
  injection.
- `SameSite=None` supports a separate Render Static Site and Web Service.
- `Partitioned` supports modern third-party-cookie isolation.
- After guest creation, the Client performs an authenticated `/api/session/me` read
  before reporting Session Online. A response body alone is not treated as proof that
  the browser retained the HttpOnly cookie.
- HMAC CSRF tokens and exact Origin checks protect unsafe routes.
- CORS permits credentials only for configured Client origins.
- Guest creation has a stricter endpoint rate limit.

For broadest browser reliability, configure same-site custom domains such as
`game.example.com` and `api.example.com`. Some privacy modes may still block a
cross-site Render cookie even when Partitioned is requested; the Client detects
failure and stays in Local mode instead of losing the save.

## Secrets and logging

`SESSION_SECRET` and `DATABASE_URL` exist only on the Web Service. They are never
included in Vite variables, API responses or public status endpoints. Structured
logs explicitly redact Cookie, Set-Cookie, Authorization and CSRF headers.

## S6 save boundary

- Save identity is always the session's character; body identity fields are rejected.
- Strict envelopes and document sanitizers bound sizes, IDs, counts, coordinates,
  schema versions, stats, mastery, inventory, boats, cargo, quests and resources.
- Revision locking prevents stale overwrites; request hashes and idempotency rows make
  retries safe; the one-time migration marker is committed atomically with the save.
- Browser migration/dirty markers are scoped to the Server character identity so a
  marker from an obsolete guest cannot authorize or block another character's save.
- Canonical coins are read from progression, never duplicated boat/item fields.
- Session expiry/revocation is checked before every load or mutation.

## Transitional trust model

S6 provides durable, isolated and structurally validated saves, but normal gameplay
values are still proposed by the Client. Bounds prevent malformed/duplicate documents;
they do not prove that a level, item, coin gain, quest progress, HP or cargo change was
earned. S7–S12 move economy, trade, rewards and combat decisions to authoritative
Server commands. Remote Save must therefore not be described as anti-cheat authority.

S7 makes world time, market stock/prices, production, factories, NPC fleets, orders,
reservations, trader memory, genome evolution, news and snapshots Server-owned. Browsers
receive a read-only snapshot and cannot upload a whole world. PostgreSQL advisory locking
prevents two Web Service instances from advancing the same world concurrently; row locking
and monotonic ticks prevent an older in-memory state from replacing a newer row.

Player trade, coins, cargo and contract/reward decisions are intentionally not made
authoritative by S7. While the Remote Economy flag is enabled, Client buy/sell UX may still
change its Local player wallet/cargo under the S6 transitional trust model, but it cannot
change shared stock; that becomes one atomic Server intent in S8. Remote contract mutations
are disabled until their owning authoritative phase. Do not market S7 as secure trading.

## Current limitations

- Guest recovery is browser-cookie based; clearing the cookie loses access until
  account linking is added.
- One initial character is selected for each guest. Multi-character selection is
  a later authenticated feature.
- Trade/coins/cargo, quest rewards and combat remain Client-authored until later phases.
- HTTP polling gives snapshots at five-second cadence; realtime ordering/resync belongs to S9.
