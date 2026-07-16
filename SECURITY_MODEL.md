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

## Current S5 limitations

- Guest recovery is browser-cookie based; clearing the cookie loses access until
  account linking is added.
- One initial character is selected for each guest. Multi-character selection is
  a later authenticated feature.
- S5 authenticates identity but does not yet make player saves, economy, trade,
  quests or combat authoritative. Their feature flags remain disabled.
