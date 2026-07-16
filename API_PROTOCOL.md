# Pirate Fruit API Protocol

The S5 API uses JSON over HTTPS and cookie-authenticated guest sessions. Every
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

S6 extends this protocol with authenticated player state. No S5 endpoint accepts
a Client-supplied user ID, character ID, reward, balance or inventory value.
