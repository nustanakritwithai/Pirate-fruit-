DROP INDEX IF EXISTS "sessions_active_character_idx";
ALTER TABLE IF EXISTS "sessions" DROP COLUMN IF EXISTS "active_character_id";
