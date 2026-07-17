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
