CREATE TABLE "player_save_operations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"character_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"resulting_revision" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_save_operations_operation_check" CHECK ("player_save_operations"."operation" in ('save', 'checkpoint', 'cargo', 'migration')),
	CONSTRAINT "player_save_operations_revision_check" CHECK ("player_save_operations"."resulting_revision" >= 1)
);
--> statement-breakpoint
ALTER TABLE "player_progression" DROP CONSTRAINT "player_progression_stats_check";--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "save_revision" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "local_save_migrated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "player_checkpoints" ADD COLUMN "heading" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_checkpoints" ADD COLUMN "camera_yaw" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_checkpoints" ADD COLUMN "world_time" double precision DEFAULT 0.31 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_progression" ADD COLUMN "mana" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_save_operations" ADD CONSTRAINT "player_save_operations_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "player_save_operations_character_key_uq" ON "player_save_operations" USING btree ("character_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "player_save_operations_character_created_idx" ON "player_save_operations" USING btree ("character_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_save_revision_check" CHECK ("characters"."save_revision" >= 0);--> statement-breakpoint
ALTER TABLE "player_progression" ADD CONSTRAINT "player_progression_stats_check" CHECK ("player_progression"."combat" >= 0 and "player_progression"."vitality" >= 0 and "player_progression"."blade" >= 0 and "player_progression"."ranged" >= 0 and "player_progression"."fruit_power" >= 0 and "player_progression"."mana" >= 0);
