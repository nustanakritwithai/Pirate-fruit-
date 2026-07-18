# S7 Operations Runbook

## Pre-enable checks

- GitHub Client/server gates are green for the deployed commit.
- `/health`, `/ready`, `/version` succeed and `/ready` reports PostgreSQL ready.
- Schema ledger contains versions 1 and 2 with repository checksums.
- Remote Session works across reload with one cookie jar.
- `ENABLE_REMOTE_SAVE` and `VITE_USE_REMOTE_SERVER` remain false until the staged test.
- `ENABLE_ECONOMY_SERVER` and `VITE_ENABLE_ECONOMY_SERVER` remain false until their
  independent Server-then-Client canary.

## Living Economy canary

1. Enable only the Web Service flag. Poll `GET /api/economy/world` at least five seconds
   apart and verify a monotonic tick, valid `lastTickAt`, bounded document and no PUT route.
2. Run two Web Service instances or restart during a canary. Exactly one instance may hold
   leadership; all instances must return the same PostgreSQL tick/stock. Catch-up may advance
   at most 12 ticks regardless of downtime.
3. Verify a snapshot row appears every 12 ticks and old rows remain capped at 120. Induce a
   transaction failure only in a test database and confirm current world plus snapshot roll back.
4. Enable the Static Site flag for two isolated browsers. Compare the same commodity price,
   tradable stock and tick. Confirm DevTools shows one batched GET per five-second cycle and
   no browser PUT/world upload.
5. Go offline for at least one poll cycle. Confirm the on-screen Local-mode notification,
   continued Local tick and intact browser mirror. Reconnect and confirm a Server snapshot
   replaces the temporary Local read model without running a parallel browser tick.

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

For economy incidents also monitor leader acquisition, pulse failures, database tick,
`last_tick_at`, snapshot count and polling 5xx/429 rates. If ticks stop or regress, disable
the Static Site economy flag first and follow `ROLLBACK_PLAN.md`; do not reseed a live world.


## S8 — Trade Server
- ลำดับเปิดใช้: ตรวจ CI browser-smoke เขียว → ตั้ง `ENABLE_TRADE_SERVER=true` ที่ Web Service → rebuild Static Site ด้วย `VITE_ENABLE_TRADE_SERVER=true` → ทดสอบซื้อ/ขายจริง 1 รายการ + ตรวจแถว `trade_transactions`
- Guest cleanup รันอัตโนมัติทุกชั่วโมงเมื่อ `ENABLE_REMOTE_SESSION=true` (log: `guest cleanup removed stale rows`)
- ตรวจธุรกรรมย้อนหลัง: `select * from trade_transactions where character_id = $1 order by created_at desc`
- CI มี job `browser-smoke`: บูตเกม build จริง + server จริง + PostgreSQL จริง แล้วยืนยัน session/save/PUT preflight/trade endpoint ข้าม origin


## S9 — Realtime
- ลำดับเปิดใช้: `ENABLE_REALTIME=true` ที่ Web Service → rebuild Static Site ด้วย `VITE_ENABLE_REALTIME=true` → เปิดเกมสองเครื่องดูราคาขยับพร้อมกันแบบไม่ต้องรอ 5 วิ
- Render free instance เดียว: WS + economy leader อยู่ process เดียวกันเสมอ
- Debug: DevTools → Network → WS → เฟรม welcome/economy; client เงียบ = ดู reconnect backoff ใน console


## S10 — Quest Server
- ลำดับเปิดใช้: migrate อัตโนมัติตอน deploy (ตาราง `quest_claims`) → ตรวจ CI browser-smoke เขียว → ตั้ง `ENABLE_QUEST_SERVER=true` ที่ Web Service → rebuild Static Site ด้วย `VITE_ENABLE_QUEST_SERVER=true` → รับเควสต์ starter ฆ่ามอนครบ แล้วตรวจแถว `quest_claims` + เหรียญใน `characters.coins`
- ตรวจการเคลมย้อนหลัง: `select * from quest_claims where character_id = $1 order by created_at desc`
- สถานะเควสต์ทางการ: `select * from player_quests where character_id = $1`
- อาการ "เควสต์เด้งกลับ/ถูกปรับ": client reconcile กับ Server ตอนบูต (Server ชนะ) — ปกติหลังสลับเครื่อง/เปิด flag ครั้งแรก


## S11 — Monster Reward Server
- ลำดับเปิดใช้: migrate อัตโนมัติตอน deploy (ตาราง `monster_kill_batches`) → CI browser-smoke เขียว → ตั้ง `ENABLE_MONSTER_SERVER=true` ที่ Web Service → rebuild Static Site ด้วย `VITE_ENABLE_MONSTER_SERVER=true` → ฆ่ามอน 1 ตัวแล้วดูเหรียญ/EXP ขึ้น (ดีเลย์ ~1-2 วิ = ปกติ รอ Server ตอบ) + ตรวจแถว `monster_kill_batches`
- ตรวจรางวัลย้อนหลัง: `select * from monster_kill_batches where character_id = $1 order by created_at desc`
- อาการ "ฆ่าแล้วรางวัลมาช้า": client คิวรายงานเป็นชุด (debounce 1.2s) และ retry เมื่อออฟไลน์ — คิวเก็บใน localStorage ไม่หายตอนรีเฟรช


## S12 — Progression Server
- ลำดับเปิดใช้: ต้องเปิด `ENABLE_QUEST_SERVER` + `ENABLE_MONSTER_SERVER` มาก่อนและ verify แล้ว → ตั้ง `ENABLE_PROGRESSION_SERVER=true` ที่ Web Service → rebuild Static Site ด้วย `VITE_ENABLE_PROGRESSION_SERVER=true` → ฆ่ามอน/เคลมเควสต์แล้วตรวจ `select level from characters` ขยับตาม + save ไม่เขียนทับ
- ตรวจสถานะทางการ: `select c.level, p.exp from characters c left join player_progression p on p.character_id = c.id where c.id = $1`
- ผู้เล่นเจอ 409 KILL_RATE_LIMITED ใน log = รายงานฆ่าเกิน 40 ตัว/นาที — client คิวไว้ retry เอง ไม่มีรางวัลหาย (ถ้าเจอบ่อยผิดปกติ = พฤติกรรมน่าสงสัย ควรดู audit)


## S13 — Multiplayer Movement
- ลำดับเปิดใช้: ต้องเปิด `ENABLE_REALTIME` และ verify แล้ว → ตั้ง `ENABLE_MULTIPLAYER=true` ที่ Web Service → rebuild Static Site ด้วย `VITE_ENABLE_MULTIPLAYER=true` → เปิดเกมสองเครื่อง (คนละบัญชี/แท็บ incognito) บนเกาะเดียวกัน เห็นผีอีกคนเดินตาม
- ไม่มี migration/ตารางใหม่ — presence อยู่ใน memory ของ instance เท่านั้น
- Render free instance เดียว: ผู้เล่นทุกคนต่อ WS เข้า process เดียวกัน presence relay จึงทำงานได้ทันที (ถ้าสเกลหลาย instance ในอนาคตต้องมี shared presence bus)
- Debug: DevTools → Network → WS → เฟรม move (ออก) / presence (เข้า)


## S13 — Multiplayer Movement
- ลำดับเปิดใช้: ต้องเปิด `ENABLE_REALTIME` และ verify แล้ว → ตั้ง `ENABLE_MULTIPLAYER=true` ที่ Web Service → rebuild Static Site ด้วย `VITE_ENABLE_MULTIPLAYER=true` → เปิดเกมสองเครื่อง (คนละบัญชี/แท็บ incognito) บนเกาะเดียวกัน เห็นผีอีกคนเดินตาม
- ไม่มี migration/ตารางใหม่ — presence อยู่ใน memory ของ instance เท่านั้น
- Render free instance เดียว: ผู้เล่นทุกคนต่อ WS เข้า process เดียวกัน relay ทำงานทันที (สเกลหลาย instance ในอนาคตต้องมี shared presence bus)
- Debug: DevTools → Network → WS → เฟรม move (ออก) / presence (เข้า)


## S14 — Boat/Naval Multiplayer
- ใช้ flag เดิม `ENABLE_MULTIPLAYER` + `VITE_ENABLE_MULTIPLAYER` (S13) — เปิดแล้วได้ทั้งเดินเท้าและเรืออัตโนมัติ ไม่มีขั้นตอนเปิดเพิ่ม
- ตรวจ: เปิดเกมสองเครื่องบนเกาะเดียวกัน ให้คนหนึ่งเรียกเรือแล้วขับ อีกคนต้องเห็น "เรือ" แล่น (ไม่ใช่ ghost) ตามรุ่นที่ขับ
- ไม่มี migration/ตาราง/endpoint ใหม่
