CREATE TABLE "quest_claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"character_id" uuid NOT NULL,
	"quest_id" varchar(128) NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"player_exp" integer NOT NULL,
	"coins" integer NOT NULL,
	"mastery_bonus" integer DEFAULT 0 NOT NULL,
	"coins_after" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quest_claims_reward_check" CHECK ("quest_claims"."player_exp" >= 0 and "quest_claims"."coins" >= 0 and "quest_claims"."mastery_bonus" >= 0 and "quest_claims"."coins_after" >= 0)
);
--> statement-breakpoint
ALTER TABLE "quest_claims" ADD CONSTRAINT "quest_claims_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quest_claims_character_idempotency_uq" ON "quest_claims" USING btree ("character_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "quest_claims_character_created_idx" ON "quest_claims" USING btree ("character_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "quest_claims_quest_idx" ON "quest_claims" USING btree ("quest_id");