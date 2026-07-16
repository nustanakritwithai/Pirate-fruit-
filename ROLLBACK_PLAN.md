# S6 Rollback Plan

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
