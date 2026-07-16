# Pirate Fruit API Protocol

The S6 API uses JSON over HTTPS and cookie-authenticated guest sessions. Every
error follows the versioned `ApiErrorResponse` envelope with a request ID.

## Browser requirements

- Client fetches use `credentials: include`.
- `CLIENT_ORIGIN` must exactly contain every allowed Static Site origin.
- Production cookies are HttpOnly, Secure, host-only, `SameSite=None`, and
  Partitioned. JavaScript cannot read the session token.
- Unsafe authenticated requests send `x-csrf-token`, obtained from `guest` or
  `me`. The CSRF token is not the session credential.

## `POST /api/session/guest`

Creates an anonymous user, its initial character and an expiring session when no
valid cookie exists. If the cookie is already valid, it resumes that identity
without creating another account.

Request body:

```json
{}
```

Response: HTTP 201 when created, HTTP 200 when resumed.

```json
{
  "ok": true,
  "created": true,
  "session": {
    "userId": "uuid",
    "characterId": "uuid",
    "characterName": "Guest-12345678",
    "expiresAt": "2026-08-15T00:00:00.000Z"
  },
  "csrfToken": "base64url-hmac"
}
```

The raw session token appears only in `Set-Cookie`. The endpoint is limited to
10 requests per minute and rejects an explicit Origin outside `CLIENT_ORIGIN`.

## `GET /api/session/me`

Returns the same response shape with `created: false`. HTTP 401 clears an invalid,
expired or revoked browser cookie. The Client may then call `guest` once.

## `POST /api/session/logout`

Requires the session cookie plus:

```text
x-csrf-token: <csrfToken from guest or me>
```

Success returns `{ "ok": true }`, revokes the row and expires the cookie.

## Session errors

| HTTP | Code | Meaning |
| --- | --- | --- |
| 401 | `SESSION_REQUIRED` | Cookie is missing, expired, malformed or revoked |
| 403 | `CSRF_INVALID` | CSRF header is missing or incorrect |
| 403 | `UNTRUSTED_ORIGIN` | Explicit request Origin is not allowed |
| 503 | `FEATURE_DISABLED` | `ENABLE_REMOTE_SESSION` is false |

## S6 player state

All routes below resolve `characterId` from the validated session cookie. Supplying
`userId`, `playerId`, or `characterId` in a strict request body is rejected.

| Method and route | Purpose | Revision behavior |
| --- | --- | --- |
| `GET /api/player/state` | Load canonical player and cargo documents | Returns current revision |
| `POST /api/player/save` | Save validated progression, inventory, equipment, boats, quests and checkpoint | Requires `expectedRevision` |
| `PUT /api/player/checkpoint` | Save position, island/spawn, HP, MP, Energy | Requires `expectedRevision` |
| `PUT /api/player/cargo` | Save sanitized cargo | Requires `expectedRevision` |
| `POST /api/player/migrate-local` | One-time legacy browser import | No revision; character must still be revision 0 |

Unsafe routes require the session cookie, allowed Origin, and `x-csrf-token`.
Mutation bodies use save `schemaVersion: 1`, an idempotency key of 16–128 safe
characters, and (except migration) the last loaded `expectedRevision`. A success
returns `{ ok, revision, idempotentReplay, migrated }`. Retrying the identical
request and key returns the original revision without inserting data again.

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_SAVE_REQUEST` | Envelope, schema version or unexpected property is invalid |
| 401 | `SESSION_REQUIRED` / `SESSION_IDENTITY_INVALID` | Session is invalid or its character disappeared |
| 409 | `STALE_SAVE_REVISION` | A newer save exists; response includes `currentRevision` |
| 409 | `IDEMPOTENCY_KEY_REUSED` | Key was reused for a different request |
| 409 | `MIGRATION_ALREADY_APPLIED` | Import was already consumed or remote progress exists |
| 422 | `INVALID_SAVE_DOCUMENT` | A legacy document failed semantic validation |
| 503 | `FEATURE_DISABLED` | Remote Save is not enabled |

Canonical coins come only from the progression document. Coin copies in item or
boat documents are overwritten when state is serialized. The API never accepts a
Client-selected identity, price, reward, or timestamp.
