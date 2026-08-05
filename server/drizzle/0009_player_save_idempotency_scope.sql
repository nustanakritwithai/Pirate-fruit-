DROP INDEX "player_save_operations_character_key_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "player_save_operations_character_op_key_uq" ON "player_save_operations" USING btree ("character_id","operation","idempotency_key");
