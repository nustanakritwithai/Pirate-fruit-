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


## S10 — Quest/Reward Authority

Flag: `ENABLE_QUEST_SERVER` (ต้องเปิด `ENABLE_REMOTE_SESSION`) — ปิดอยู่ทุก endpoint ตอบ 503 `FEATURE_DISABLED`
ทุก mutation ต้องมี session cookie + `x-csrf-token` + Origin allowlist; รางวัลทุกเลขมาจาก databook ฝั่ง Server (`shared/src/quest/definitions.ts`)

### GET /api/quest/state
สถานะทางการของตัวละคร: `{ active: { questId, progress[], status: 'active'|'completed' } | null, completedQuestIds[] }` — client ใช้ reconcile ตอนบูต (Server ชนะ)

### POST /api/quest/accept — `{ schemaVersion, questId, replaceActive? }`
ตรวจ `characters.level` กับ `minimumLevel` (LEVEL_TOO_LOW), เควสต์ active ซ้ำ (QUEST_ALREADY_ACTIVE), มีเควสต์อื่น active โดยไม่ replace (ACTIVE_QUEST_CONFLICT) — replace จะ mark ตัวเก่าเป็น `abandoned`

### POST /api/quest/progress — `{ schemaVersion, events[] }` (สูงสุด 10 events/ครั้ง)
event: `{ kind: 'kill'|'deliver', targetId, amount ≤ 99, isBoss?, islandId? }` — Server จับคู่กับ objective ของเควสต์ active เท่านั้น (boss objective ต้อง isBoss, deliver ตรวจ islandId), clamp ที่ requiredAmount แล้วคืน progress ทางการ + `completed`
ไม่มีเควสต์ active → events ถูกทิ้งเงียบ ๆ (`questId: null`) ไม่ใช่ error; rate limit 60/นาที

### POST /api/quest/claim — `{ schemaVersion, questId, idempotencyKey }`
เคลมได้เฉพาะเมื่อ Server เห็นสถานะ `completed` เท่านั้น (QUEST_NOT_COMPLETE ถ้ายังไม่ครบ/เคลมรอบนี้ไปแล้ว) — ธุรกรรมเดียว: lock ตัวละคร → ตรวจ idempotency (`quest_claims`) → บวกเหรียญเข้า `characters.coins` → mark `claimed` → บันทึก audit
ตอบ `{ playerExp, coins, masteryBonus, coinsTotal, idempotentReplay }` — client apply exp/mastery ฝั่งตนด้วยเลขจาก Server (transitional จนกว่า progression จะเป็นของ Server เต็มตัว)

### POST /api/quest/abandon — `{}`
mark เควสต์ active/completed เป็น `abandoned` (ไม่มีรางวัล)


## S11 — Monster Reward Authority

Flag: `ENABLE_MONSTER_SERVER` (ต้องเปิด `ENABLE_REMOTE_SESSION`) — ปิดอยู่ endpoint ตอบ 503 `FEATURE_DISABLED`

### POST /api/monster/kills — `{ schemaVersion, idempotencyKey, kills[] }`
- `kills`: สูงสุด 20 รายการ, `{ monsterId, count ≤ 10 }` — id ต้องอยู่ใน databook (`UNKNOWN_MONSTER` = 422)
- Server คิดรางวัลจาก `shared/src/monster/rewards.ts` (ตาราง + สูตรตัวคูณส่วนต่างเลเวลเดียวกับเกม) โดยใช้ `characters.level` — เหรียญเข้า `characters.coins` แบบ atomic + audit ลง `monster_kill_batches`
- ตอบรางวัลรายรายการ (ลำดับเดิม) + totals + `coinsTotal` — client ใช้เลขเหล่านี้ apply exp/mastery ฝั่งตน (mastery แตกต่ออาวุธด้วยสูตรแบ่งเดิมของเกม)
- Idempotent: คีย์เดิม+payload เดิมคืนผลเดิม; คีย์เดิมต่าง payload → 409 `IDEMPOTENCY_KEY_REUSED`; rate limit 60/นาที


## S12 — Progression Authority (Level/EXP)

Flag: `ENABLE_PROGRESSION_SERVER` (ต้องเปิด `ENABLE_QUEST_SERVER` + `ENABLE_MONSTER_SERVER` ก่อน — แหล่ง EXP ทุกทางต้องเป็นของ Server แล้ว)

### พฤติกรรมเมื่อเปิด flag
- ทุกครั้งที่ Server แจก EXP (quest claim / monster kills) จะสะสมเข้า `player_progression.exp` แล้วเดินเลเวลด้วยสูตร shared (`floor(2×level^2.3 + 84)`) → เขียน `characters.level` ในธุรกรรมเดียวกับการแจกรางวัล
- Endpoint save (`/api/player/*`) **เลิกเขียนทับ** `characters.level` และ `player_progression.exp` — level กลายเป็นค่าที่ Server พิสูจน์ได้ (ปิดช่องโหว่ level gate ของ S10/S11)
- Kill-rate plausibility: จำกัดการฆ่ารวม ≤40 ตัวต่อหน้าต่าง 60 วิ ต่อตัวละคร — เกิน → 409 `KILL_RATE_LIMITED` (client เก็บคิวไว้ retry เอง)

### GET /api/progression/state
สถานะทางการ `{ level, exp, coins }` — client ใช้ reconcile ตอนบูต: Server นำหน้า → เติม EXP ส่วนต่างเข้า local; local นำหน้า (แต้มค้างท่อ) → ปล่อยให้ sync ไล่ส่งจนบรรจบ (ไม่มีการลดเลเวลผู้เล่น)


## S13 — Multiplayer Movement (presence relay)

Flag: `ENABLE_MULTIPLAYER` (ต้องเปิด `ENABLE_REALTIME` ก่อน) — เดินบนช่อง WebSocket เดิม (S9)

### Client → Server: `{type:'move', islandId, x, y, z, heading, onBoat}`
- ข้อยกเว้นเดียวของช่อง push-only: client ส่ง move ได้ (ยังส่ง ping ได้เหมือนเดิม; type อื่นยังปิด 1008)
- ไม่ใช่ authority: เป็นแค่ presence relay — ไม่มีผล gameplay/collision/รางวัล; payload ผิดรูป (พิกัดไม่ใช่ตัวเลข) ปิด 1008
- Throttle: ส่งถี่กว่า `REALTIME_MOVE_MIN_INTERVAL_MS` (80ms) Server เก็บตำแหน่งล่าสุดแต่ไม่ relay

### Server → Client: `{type:'presence', seq, playerId, name, islandId, x, y, z, heading, onBoat}` / `{type:'presence-leave', seq, playerId}`
- Server relay ตำแหน่งให้เฉพาะผู้เล่น**บนเกาะเดียวกัน**; ผู้เล่นที่เพิ่งปรากฏ/ย้ายเกาะจะได้ presence ของคนอื่นบนเกาะทันที (seed)
- presence เป็นข้อมูล ephemeral: ใช้ seq stream เดียวกับ economy แต่ client apply ได้เลยแม้ seq กระโดด (ตำแหน่งสัมบูรณ์ทับของเก่า) — resync ยังทำงานให้ economy ตามปกติ
- disconnect → broadcast presence-leave ให้ islanders


## S13 — Multiplayer Movement (presence relay)

Flag: `ENABLE_MULTIPLAYER` (ต้องเปิด `ENABLE_REALTIME` ก่อน) — เดินบนช่อง WebSocket เดิม (S9)

### Client → Server: `{type:'move', islandId, x, y, z, heading, onBoat}`
- ข้อยกเว้นเดียวของช่อง push-only: client ส่ง move ได้ (ยังส่ง ping ได้; type อื่นยังปิด 1008)
- ไม่ใช่ authority — presence relay ล้วน (ไม่มีผล gameplay/collision/รางวัล); พิกัดไม่ใช่ตัวเลขจำกัด/islandId ว่าง → ปิด 1008
- Throttle: ส่งถี่กว่า `REALTIME_MOVE_MIN_INTERVAL_MS` (80ms) Server เก็บตำแหน่งล่าสุดแต่ไม่ relay
- client เกม: ส่งทุก 100ms ผ่าน `setInterval` (จงใจไม่ผูก rAF game loop — แท็บพื้นหลังโดน throttle จน presence ไม่ไหล)

### Server → Client: `{type:'presence', seq, playerId, name, islandId, x, y, z, heading, onBoat}` / `{type:'presence-leave', seq, playerId}`
- Server relay ตำแหน่งให้เฉพาะผู้เล่น**บนเกาะเดียวกัน**; ผู้เล่นที่เพิ่งปรากฏ/ย้ายเกาะจะได้ presence ของคนอื่นบนเกาะทันที (seed)
- presence เป็น ephemeral: ใช้ seq stream เดียวกับ economy แต่ client apply ได้เลยแม้ seq กระโดด (ตำแหน่งสัมบูรณ์ทับของเก่า) — resync ยังทำงานให้ economy ตามปกติ
- disconnect → broadcast presence-leave ให้ islanders


## S14 — Boat/Naval Multiplayer (boat presence)

ต่อยอด S13 บน flag เดิม `ENABLE_MULTIPLAYER` — **ไม่มี flag/ตาราง/endpoint ใหม่**

- `move` และ `presence` เพิ่มฟิลด์ `boatId?` (BOAT_DEFINITIONS id) — ส่งเมื่อ `onBoat` เป็นจริง
- Server: ถ้า `onBoat=false` จะทิ้ง `boatId` ทิ้ง (กันแนบมั่ว); `boatId` ยาว ≤128 เท่านั้น
- Client: presence ที่ `onBoat=true` เรนเดอร์เป็น "เรือ proxy" (ตัวเรือ+ใบเรือ ขนาด/สีตามรุ่นจาก BOAT_DEFINITIONS) แทน ghost; ขึ้น/ลงเรือหรือเปลี่ยนรุ่น → สลับ avatar ที่ตำแหน่งเดิม; รุ่นที่ไม่รู้จัก → เรือ default
- ยังเป็น presence ล้วน: เห็นเรือคนอื่นแล่นได้ แต่ไม่มี collision/ยิงกัน (naval combat authority เกินขอบเขต stateless presence — งานอนาคต)
