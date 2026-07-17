CREATE TABLE "monster_kill_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"character_id" uuid NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"kills_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"player_exp" integer NOT NULL,
	"mastery_exp" integer NOT NULL,
	"coins" integer NOT NULL,
	"coins_after" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monster_kill_batches_reward_check" CHECK ("monster_kill_batches"."player_exp" >= 0 and "monster_kill_batches"."mastery_exp" >= 0 and "monster_kill_batches"."coins" >= 0 and "monster_kill_batches"."coins_after" >= 0)
);
--> statement-breakpoint
ALTER TABLE "monster_kill_batches" ADD CONSTRAINT "monster_kill_batches_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "monster_kill_batches_character_idempotency_uq" ON "monster_kill_batches" USING btree ("character_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "monster_kill_batches_character_created_idx" ON "monster_kill_batches" USING btree ("character_id","created_at" DESC NULLS LAST);