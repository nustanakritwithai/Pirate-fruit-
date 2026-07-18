# S7 Rollback Plan

1. Set Static Site `VITE_ENABLE_ECONOMY_SERVER=false` and redeploy. Browsers immediately
   resume the unchanged Local simulation and legacy economy document.
2. Set Web Service `ENABLE_ECONOMY_SERVER=false` and redeploy. This stops leadership/ticks
   and removes the read endpoint without deleting `economy_worlds` or snapshots.
3. Preserve the canonical world row and newest snapshots for diagnosis. Compare monotonic
   ticks and request IDs; never export database credentials, cookies or session values.
4. Roll the Web Service back only after the Client flag is off. S7 adds no schema migration,
   so rollback must not drop or rewrite tables. Prefer restoring a verified snapshot in a
   controlled maintenance window if the world document itself is corrupt.

The Server caps restart catch-up at 12 ticks and discards uncommitted in-memory advances on
write failure. A Client network failure keeps its Local mirror and visibly switches to Local
mode; operators must not instruct players to clear browser storage during the incident.

## S6 Remote Save fallback

1. Set Static Site `VITE_USE_REMOTE_SERVER=false` and redeploy. The unchanged legacy
   keys immediately restore Local mode; Remote Session may remain enabled independently.
2. Set Web Service `ENABLE_REMOTE_SAVE=false`. This returns `FEATURE_DISABLED` without
   deleting PostgreSQL data.
3. Preserve the database and `player_save_operations` ledger for investigation. Export
   revision, request ID and operation metadata without cookies, CSRF values or secrets.
4. Roll the Web Service back only after Remote Save is disabled. Prefer a forward fix;
   schema version 2 is backward-compatible while flags are off.

The S6 down migration drops revision and migration history. Use it only in an empty
pre-production database after a verified backup. Never run the full S4 rollback on live
player data. A browser's `pirate-fruit:remote-save-backup-v1` and legacy keys are recovery
copies; do not clear them as part of incident rollback.


## S8 — Trade Server rollback
1. Rebuild Static Site โดยเอา `VITE_ENABLE_TRADE_SERVER` ออก (client กลับไปเทรดแบบ local)
2. ตั้ง `ENABLE_TRADE_SERVER=false` ที่ Web Service (endpoint ตอบ 503)
3. ไม่ต้องแตะข้อมูล: `trade_transactions` เป็น audit log เก็บไว้ตรวจสอบ, `characters.coins`/`player_cargo` ยัง sync ผ่านระบบ save ปกติ


## S9 — Realtime rollback
1. Rebuild Static Site โดยเอา `VITE_ENABLE_REALTIME` ออก (client กลับไป poll ทุก 5 วิ — ระบบเดิมยังอยู่ครบ)
2. ตั้ง `ENABLE_REALTIME=false` ที่ Web Service (route /ws หายไป)
3. ไม่มีข้อมูลใด ๆ ต้องกู้ — ช่องทางนี้ stateless ทั้งหมด


## S10 — Quest Server rollback
1. Rebuild Static Site โดยเอา `VITE_ENABLE_QUEST_SERVER` ออก (client กลับไปแจกรางวัลเควสต์แบบ local เดิม)
2. ตั้ง `ENABLE_QUEST_SERVER=false` ที่ Web Service (endpoint ตอบ 503)
3. ข้อมูลไม่ต้องกู้: `quest_claims` เป็น audit log เก็บไว้ตรวจสอบ; `player_quests` เป็นสถานะที่ client จะเขียนทับผ่านระบบเดิมเมื่อกลับ local; เหรียญที่แจกไปแล้วอยู่ใน `characters.coins` ตาม transitional model ปกติ
4. ถอนตาราง (เฉพาะกรณีถอนทั้ง S10): `drizzle/rollback/0002_s10_quest_claims.down.sql`


## S11 — Monster Reward Server rollback
1. Rebuild Static Site โดยเอา `VITE_ENABLE_MONSTER_SERVER` ออก (client กลับไปแจกรางวัล local เดิม)
2. ตั้ง `ENABLE_MONSTER_SERVER=false` ที่ Web Service (endpoint ตอบ 503)
3. ข้อมูลไม่ต้องกู้: `monster_kill_batches` เป็น audit log; เหรียญที่แจกไปแล้วอยู่ใน `characters.coins` ตาม transitional model
4. ถอนตาราง (เฉพาะกรณีถอนทั้ง S11): `drizzle/rollback/0003_s11_monster_kill_batches.down.sql`


## S12 — Progression Server rollback
1. Rebuild Static Site โดยเอา `VITE_ENABLE_PROGRESSION_SERVER` ออก
2. ตั้ง `ENABLE_PROGRESSION_SERVER=false` — save กลับไปเขียน level/exp แบบเดิม (ค่าล่าสุดจาก client ชนะ — level ที่ Server เดินไว้จะถูก save รอบถัดไปเขียนทับ ซึ่งตรงกับ local ของผู้เล่นอยู่แล้ว)
3. ถอนคอลัมน์ (เฉพาะกรณีถอนทั้ง S12): `drizzle/rollback/0004_s12_kill_count.down.sql`


## S13 — Multiplayer Movement rollback
1. Rebuild Static Site โดยเอา `VITE_ENABLE_MULTIPLAYER` ออก (client เลิกส่ง move + ไม่เรนเดอร์ผู้เล่นอื่น)
2. ตั้ง `ENABLE_MULTIPLAYER=false` ที่ Web Service (Server เพิกเฉย move — ผู้เล่นเห็นแต่ตัวเอง)
3. ไม่มีข้อมูลต้องกู้ — presence เป็น memory ล้วน stateless; ช่อง WS (S9) ยังทำงานปกติ


## S13 — Multiplayer Movement rollback
1. Rebuild Static Site โดยเอา `VITE_ENABLE_MULTIPLAYER` ออก (client เลิกส่ง move + ไม่เรนเดอร์ผู้เล่นอื่น)
2. ตั้ง `ENABLE_MULTIPLAYER=false` ที่ Web Service (Server เพิกเฉย move — ผู้เล่นเห็นแต่ตัวเอง)
3. ไม่มีข้อมูลต้องกู้ — presence เป็น memory ล้วน stateless; ช่อง WS (S9) ยังทำงานปกติ


## S14 — Boat/Naval Multiplayer rollback
- ไม่มีขั้นตอนแยก — ใช้ rollback ของ S13 (ปิด `ENABLE_MULTIPLAYER` / เอา `VITE_ENABLE_MULTIPLAYER` ออก); `boatId` เป็นฟิลด์เสริมบน presence เดิม ไม่มี state ค้าง

## S15 — Multiplayer Combat Authority (PvP) rollback
1. Rebuild Static Site โดยเอา `VITE_ENABLE_PVP` ออก (client เลิกส่ง `attack` + ไม่ผูก M1/สกิลเข้ากับ PvP)
2. ตั้ง `ENABLE_PVP=false` ที่ Web Service (Server เพิกเฉย `attack` — ไม่ resolve การต่อสู้ระหว่างผู้เล่น)
- HP PvP เป็น ephemeral ในหน่วยความจำ Server ล้วน — ไม่มี migration/ตาราง/ข้อมูล persist ให้ย้อน; ปิด flag = จบทันที (presence S13/S14 ยังทำงานต่อได้ปกติ)

## S16 — Shared Monster World rollback
1. Rebuild Static Site โดยเอา `VITE_ENABLE_SHARED_WORLD_MONSTERS` ออก (client กลับไป spawn มอนสเตอร์ท้องถิ่นเอง + เลิกส่ง world-monster-hit)
2. ตั้ง `ENABLE_SHARED_WORLD_MONSTERS=false` ที่ Web Service (Server หยุด tick + เพิกเฉย world-monster-hit)
- ตาราง `world_monster_state` คงอยู่ได้ (ไม่ต้อง rollback schema) — เป็น state ephemeral ที่ไม่กระทบ save ผู้เล่น; ถ้าจำเป็นต้องถอย schema ใช้ `runRollback` ตามลำดับ migration ปกติ
