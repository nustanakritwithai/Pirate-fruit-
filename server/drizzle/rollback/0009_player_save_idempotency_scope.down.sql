DROP INDEX IF EXISTS "player_save_operations_character_op_key_uq";
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = 'player_save_operations'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "player_save_operations_character_key_uq"
      ON "player_save_operations" USING btree ("character_id","idempotency_key");
  END IF;
END $$;
