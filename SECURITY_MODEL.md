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


## S8 — Trade authority และ transitional coins model
- Client ส่งเฉพาะ intent; ราคา/สต็อก/ค่าธรรมเนียมคิดจาก engine บน Server (bundle สูตรเดียวกับเกม)
- Canonical coins = `characters.coins` และ cargo = `player_cargo`; ธุรกรรม trade แก้ค่าเหล่านี้แบบ atomic พร้อม audit ใน `trade_transactions`
- Transitional (จนถึง S10-S12): รางวัลจากมอนสเตอร์/เควสต์ยังเกิดฝั่ง client และเข้าระบบผ่าน player save — endpoint save ยังรับ coins จาก client ในช่วงเปลี่ยนผ่าน โดยมี trade audit log ไว้ reconcile; อำนาจเต็มจะปิดช่องนี้เมื่อแหล่งรายได้ทุกทางย้ายขึ้น Server
- Browser smoke test ใน CI ยิงข้าม origin ด้วยเบราว์เซอร์จริง — กัน regression คลาส CORS/preflight/cookie ที่เทสต์ระดับ inject/Node fetch มองไม่เห็น (บทเรียนจากเหตุการณ์ CORS PUT ใน production)
- Guest cleanup: sessions ที่หมดอายุ/ถูก revoke เกิน 7 วันถูกลบ; guest ที่ไม่มี session เหลือ ไม่มีความคืบหน้า (save_revision=0 และไม่เคย migrate) และเก่ากว่า 45 วันถูกลบ — ผู้เล่นที่มีเซฟจริงไม่ถูกแตะ


## S9 — Realtime channel
- ช่องทาง push อย่างเดียว — ไม่มีคำสั่งเกมผ่าน WS (คำสั่งยังเป็น HTTP + CSRF จนกว่าจะย้ายรายระบบใน S10+)
- Upgrade ตรวจ Origin + session cookie ใบเดียวกับ REST; ไม่มี token ใน URL
- Client message ถูกจำกัดขนาด/ชนิด — ผิดสเปกปิดทันที (1008); เพดาน connection ต่อ instance 200


## S10 — Quest/Reward authority
- เลขรางวัล (exp/เหรียญ/mastery) มาจากนิยามใน shared databook ฝั่ง Server เท่านั้น — คำขอ claim ไม่มี field เลขรางวัลให้ส่ง
- เงินรางวัลเขียนเข้า `characters.coins` (canonical) แบบ atomic พร้อม audit ใน `quest_claims` (unique idempotency key ต่อตัวละคร + request hash กัน key reuse ต่างเควสต์)
- Progress เป็น client report ที่ถูกจำกัด: ≤10 events/รายงาน, amount ≤99, clamp ที่ requiredAmount, rate limit 60/นาที — และจับคู่ objective ฝั่ง Server เท่านั้น
- Transitional (จนถึง S11-S12 Monster/Combat authority): Server ยังพิสูจน์ไม่ได้ว่าการฆ่ามอนเกิดจริง — เพดาน+rate limit จำกัดความเร็วฟาร์มเกินจริง และเควสต์ repeatable ก็เล่นซ้ำได้ตามดีไซน์อยู่แล้ว; `characters.level` ที่ใช้ gate ยังมาจาก save (client-reported) ในช่วงเปลี่ยนผ่าน


## S11 — Monster reward authority
- เลขรางวัลจากการฆ่ามอนคิดฝั่ง Server จาก shared databook + ตัวคูณเลเวล (`characters.level`) — client รายงานได้แค่ "ฆ่าตัวไหนกี่ตัว"
- เพดานต่อรายงาน: ≤20 รายการ, count ≤10, rate limit 60/นาที + idempotency ledger (`monster_kill_batches`)
- Transitional (จนถึง S12 Combat authority): Server ยังพิสูจน์ไม่ได้ว่าการฆ่าเกิดจริง — เพดาน+rate limit จำกัดความเร็วฟาร์มสูงสุดไว้ (แหล่งเหรียญที่ client ยังแจกเองเหลือเฉพาะรางวัลเรือรบ/ยึดเรือ ซึ่งจะย้ายใน S12-S14)


## S12 — Progression authority
- `characters.level` เดินจาก EXP ที่ Server แจกเองเท่านั้น (quest + monster ซึ่งเป็นของ Server ตั้งแต่ S10-S11) — save จาก client เขียน level/exp ไม่ได้อีก เมื่อ `ENABLE_PROGRESSION_SERVER=true`
- ผลลัพธ์: level gate ของเควสต์และตัวคูณรางวัลใช้ค่าที่ Server พิสูจน์ได้ ไม่ใช่ค่าที่ client รายงาน (ปิดความเสี่ยง transitional ข้อ "level มาจาก save" ของ S10/S11)
- Kill-rate cap ต่อตัวละคร (40/60 วิ) เป็นชั้น plausibility เพิ่มจากเพดานต่อรายงานของ S11 — สถิติจริงเก็บใน `monster_kill_batches.kill_count`
- ที่ยังเป็น transitional: เหรียญยังรับจาก save (แหล่งเหรียญ client เหลือ naval — S14), สเตต/mastery/สิ่งของยังเป็นของ client


## S13 — Multiplayer presence
- ช่อง `move` เป็น presence relay ล้วน — Server ไม่เชื่อพิกัดเป็น authority ใด ๆ (ไม่มีผลเงิน/รางวัล/collision); ผู้เล่นเห็นกันเดินได้แต่ยังชนกันไม่ได้ในเฟสนี้
- validate payload (พิกัดต้องเป็นตัวเลขจำกัด, islandId ≤96 ตัว) + throttle 80ms/relay + จำกัดขนาดข้อความ 1KB เดิม — กัน broadcast flood
- กรอง relay ตามเกาะ: presence ไม่รั่วข้ามเกาะ (ลด surface + payload)
- ตัวตน presence (playerId/name) มาจาก session ที่ auth แล้ว — client ปลอมชื่อคนอื่นไม่ได้ (Server แนบจาก characterName ของ connection เอง)


## S13 — Multiplayer presence
- ช่อง `move` เป็น presence relay ล้วน — Server ไม่เชื่อพิกัดเป็น authority ใด ๆ (ไม่มีผลเงิน/รางวัล/collision); ผู้เล่นเห็นกันเดินได้แต่ยังชนกันไม่ได้ในเฟสนี้
- validate payload (พิกัดเป็นตัวเลขจำกัด, islandId ≤96) + throttle 80ms/relay + จำกัดขนาดข้อความ 1KB เดิม — กัน broadcast flood
- กรอง relay ตามเกาะ: presence ไม่รั่วข้ามเกาะ
- ตัวตน presence (playerId/name) แนบจาก session ที่ auth แล้วฝั่ง Server (characterName ของ connection) — client ปลอมชื่อ/ตัวตนคนอื่นไม่ได้


## S14 — Boat presence
- `boatId` เป็นข้อมูลแสดงผลล้วน (เลือกโมเดลเรือ) — ไม่มีผล gameplay/รางวัล/ความเร็วจริง; Server ไม่เชื่อเป็น authority
- validate: รับ `boatId` เฉพาะเมื่อ `onBoat=true` และยาว ≤128; อื่น ๆ ทิ้ง — เดินบน relay + throttle + กรองเกาะเดิมของ S13

## S15 — PvP combat authority
- **ห้ามเชื่อดาเมจจาก Client**: ข้อความ `attack` ไม่มีฟิลด์ดาเมจ — Server เลือกดาเมจจากตารางคงที่ตาม `kind` เท่านั้น (client ปั้นเลขดาเมจไม่ได้)
- **Server เป็นเจ้าของ HP**: HP การต่อสู้อยู่ในหน่วยความจำ Server (ephemeral ต่อ session, ไม่ persist) — Client ปรับหลอดเลือดตามค่า `hp/maxHp` ที่ Server ส่ง (โดนเราเอง) ไม่ใช่ตัวตัดสินเอง
- **ระยะ/ตำแหน่งวัดจากฝั่ง Server**: ใช้ presence ล่าสุดที่ auth แล้ว — client ยิงข้ามเกาะ/นอกระยะ/ใส่ตัวเองไม่ได้ (ปัดตกเงียบ); ตัวตนผู้โจมตี (`attackerId`) แนบจาก connection ของ Server
- **กันสแปม/ออโต้**: throttle ต่อคู่ผู้โจมตี→เป้า (`PVP_ATTACK_MIN_INTERVAL_MS`) — ยิงถี่เกินถูกทิ้ง; ตาย/เกิดใหม่ Server เป็นคนตั้งเวลา (`PVP_RESPAWN_MS`)
- ยังไม่มีผลต่อเศรษฐกิจ/รางวัล: แพ้ PvP ไม่เสียเหรียญ/ของ (ephemeral duel) — reward-on-kill เป็นงานอนาคต; ปิดด้วย `ENABLE_PVP=false` default ในโปรดักชัน

## S16 — Shared monster world authority
- **Server เป็นเจ้าของมอนสเตอร์**: spawn/AI/HP/death/respawn อยู่บน Server ล้วน — Client ส่งได้แค่ `world-monster-hit` (เจตนาตี) ไม่มีดาเมจ (กันโกง)
- ดาเมจ + ระยะตัดสินฝั่ง Server (ตารางคงที่ + วัดระยะจาก presence ผู้โจมตี) — ตีข้ามเกาะ/นอกระยะ/ตัวที่ตายแล้ว = ปัดตก
- HP/death shared: ทุกคนบนเกาะเห็นค่าเดียวกันจาก snapshot/delta ของ Server (ไม่มี local authority เมื่อเปิด flag — client ปิด ambient spawn ท้องถิ่น)
- interest ระดับเกาะ + tick rate จำกัด (`WORLD_MONSTER_TICK_MS`) — คุมต้นทุน broadcast/CPU
- AI ไม่ target ผู้เล่นที่หายจาก world (หลุด presence) — กัน target ค้างกับ ghost
- contribution (ใครตีเท่าไร) เก็บฝั่ง Server มีหน้าต่างเวลา — ผู้เล่นนอกระยะ/ไม่ได้ตีไม่ถูกนับ (เตรียมแจก reward/loot phase ถัดไปแบบ authoritative)
- player HP จากมอนสเตอร์ยังเป็น client-side ในเฟสนี้ (Server เป็นเจ้าของแค่ตัวมอนสเตอร์) — reward/loot authority = งานถัดไป; ปิดด้วย `ENABLE_SHARED_WORLD_MONSTERS=false` default

## S17 — Boat/naval authority
- Client ส่งเฉพาะ control intent; protocol ไม่มีพิกัดเรือ/ความเร็ว/HP/damage/target/reward ให้ปลอม
- Server resolve active boat จาก `player_boats` ของ character ที่ auth แล้ว, spawn ที่ dock ของ Server, clamp input, tick movement/collision และ broadside hit เอง
- `intentId` ให้ replay protection; cooldown ปืนอยู่ใน runtime Server; ผู้ที่ไม่ใช่ helm สั่งขับ/ยิงไม่ได้
- board/disembark ตรวจ entity จริง เกาะ และระยะจาก authenticated presence; ระหว่างเป็น passenger จะไม่รับ legacy client move และ derive presence จาก boat transform
- HP world persist กลับ `world_boat_state` และ `player_boats`; cargo ยังผูก FK กับ boat id เดียวกัน จึงไม่เปลี่ยน capacity ผ่าน Client
- Server broadcast absolute snapshot/delta; prediction ฝั่ง Clientมีผลเฉพาะ rendering และถูก Server correction ทับเสมอ
