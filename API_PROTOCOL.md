# Pirate Fruit API Protocol

The S6/S7 API uses JSON over HTTPS. Player routes use cookie-authenticated guest sessions;
the shared S7 economy snapshot is a read-only public resource. Every
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

## S7 shared living economy

`GET /api/economy/world` returns the canonical PostgreSQL-backed world produced by
the elected Server runtime. It does not require player identity because every browser
reads the same world, but CORS, global rate limiting and a route limit of 60 requests
per minute still apply. Responses use `Cache-Control: no-store` and a tick ETag.

```json
{
  "ok": true,
  "schemaVersion": 1,
  "worldId": "main",
  "tick": 42,
  "lastTickAt": "2026-01-01T00:00:00.000Z",
  "serverTime": "2026-01-01T00:00:01.000Z",
  "tickIntervalMs": 5000,
  "state": {
    "schemaVersion": 1,
    "world": "{\"version\":8,\"world\":{...}}"
  }
}
```

The inner `world` string deliberately matches the bounded Local save document so the
existing Three.js client can hydrate the same simulation read model without rewriting
gameplay UI. The Client validates envelope version, timestamp, world ID, tick and document
shape before applying it.

There is no `PUT /api/economy/world`. Browser-originated prices, stock, factories,
fleets, orders, reservations, trader memory, genome state, news, tick or timestamps are
never accepted. When `ENABLE_ECONOMY_SERVER=false`, the route is absent (404) and the
Client continues with its Local economy. S8 will add narrow buy/sell intent endpoints;
it will not add whole-world writes.


## S8 — Server-authoritative Trade

### POST /api/trade/execute
- Auth: session cookie + `x-csrf-token` + Origin allowlist · Rate limit 30/นาที
- Flag: `ENABLE_TRADE_SERVER` (ต้องเปิด `ENABLE_REMOTE_SESSION` + `ENABLE_ECONOMY_SERVER` ก่อน) — ปิดอยู่ตอบ 503 `FEATURE_DISABLED`
- Request: `{ schemaVersion: 1, idempotencyKey, action: 'buy'|'sell', islandId, commodityId, quantity (1-999), expectedUnitPrice? }`
- Server เป็นผู้คิดราคา/ตรวจสต็อก/หักเงิน/ย้าย cargo ทั้งหมด — `expectedUnitPrice` ใช้เทียบ tolerance 10% เท่านั้น (`PRICE_MOVED` เมื่อราคาวิ่งเกิน)
- Response 200: `{ ok, action, islandId, commodityId, quantity, unitPrice, total, fee, coins, cargo[], idempotentReplay }`
  - `coins` = canonical จาก `characters.coins`, `cargo` = canonical จาก `player_cargo`
- Reject codes (409/422/503): `INSUFFICIENT_STOCK`, `INSUFFICIENT_COINS`, `INSUFFICIENT_CARGO`, `CARGO_FULL`, `PRICE_MOVED`, `MARKET_UNAVAILABLE`, `IDEMPOTENCY_KEY_REUSED`, `INVALID_TRADE_REQUEST`, `ECONOMY_NOT_READY`
- Consistency: ธุรกรรม PG เดียว (lock แถว character) + งานทั้งก้อน serialize บนคิวเดียวกับ economy tick (single writer ต่อ world document) — stock ใน engine ถูกหักหลัง DB commit เท่านั้น
- Idempotency: unique `(character_id, idempotency_key)` + request hash — retry key เดิม payload เดิมคืนผลเดิม, key เดิม payload ต่างถูกปฏิเสธ


## S9 — Realtime (WebSocket)

### GET /ws (WebSocket upgrade)
- Flag: `ENABLE_REALTIME` (ต้องเปิด `ENABLE_REMOTE_SESSION`) — ปิดอยู่ route ไม่ถูก register
- Auth ที่จังหวะ upgrade: Origin allowlist (ปิด 4403) + session cookie (ปิด 4401)
- Push อย่างเดียว: `welcome` (heartbeatIntervalMs) · `economy` (tick + world string เดียวกับ REST) · `announcement` · `pong`
- Client ส่งได้แค่ `{type:'ping', sentAt}` — เกินสเปก/ใหญ่เกิน 1KB = ปิดด้วย 1008
- **Out-of-order guard**: ทุกข้อความมี `seq` +1 ต่อ connection — client ทิ้ง seq ย้อนหลัง, seq กระโดด = พลาดข้อความ → ดึง snapshot ทาง REST (resync) แล้วนับต่อ
- Heartbeat: client ping ตามรอบใน welcome; เงียบเกิน 45 วิ server ตัด (1001), เงียบ 2.5 รอบ client ตัดเองแล้ว reconnect แบบ exponential backoff (สูงสุด 30 วิ + jitter)
- ระหว่าง WS เชื่อมอยู่ client หยุด poll `/api/economy/world`; WS หลุด → กลับไป poll อัตโนมัติ
