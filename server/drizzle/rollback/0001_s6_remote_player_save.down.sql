DROP TABLE IF EXISTS "player_save_operations" CASCADE;
ALTER TABLE IF EXISTS "player_checkpoints" DROP COLUMN IF EXISTS "world_time";
ALTER TABLE IF EXISTS "player_checkpoints" DROP COLUMN IF EXISTS "camera_yaw";
ALTER TABLE IF EXISTS "player_checkpoints" DROP COLUMN IF EXISTS "heading";
ALTER TABLE IF EXISTS "player_progression" DROP COLUMN IF EXISTS "mana";
ALTER TABLE IF EXISTS "player_progression" DROP CONSTRAINT IF EXISTS "player_progression_stats_check";
ALTER TABLE IF EXISTS "player_progression" ADD CONSTRAINT "player_progression_stats_check"
  CHECK ("combat" >= 0 and "vitality" >= 0 and "blade" >= 0 and
         "ranged" >= 0 and "fruit_power" >= 0);
ALTER TABLE IF EXISTS "characters" DROP COLUMN IF EXISTS "local_save_migrated_at";
ALTER TABLE IF EXISTS "characters" DROP COLUMN IF EXISTS "save_revision";
