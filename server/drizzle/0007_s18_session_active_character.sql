ALTER TABLE "sessions" ADD COLUMN "active_character_id" uuid;
CREATE INDEX "sessions_active_character_idx" ON "sessions" ("active_character_id");
