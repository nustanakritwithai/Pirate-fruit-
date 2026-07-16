CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(64) NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"coins" bigint DEFAULT 0 NOT NULL,
	"current_island_id" varchar(96) NOT NULL,
	"spawn_id" varchar(96) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "characters_level_check" CHECK ("characters"."level" >= 1),
	CONSTRAINT "characters_coins_check" CHECK ("characters"."coins" >= 0)
);
--> statement-breakpoint
CREATE TABLE "economy_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"world_id" varchar(96) NOT NULL,
	"version" integer NOT NULL,
	"tick" bigint NOT NULL,
	"state_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "economy_snapshots_version_check" CHECK ("economy_snapshots"."version" >= 1),
	CONSTRAINT "economy_snapshots_tick_check" CHECK ("economy_snapshots"."tick" >= 0)
);
--> statement-breakpoint
CREATE TABLE "economy_worlds" (
	"id" varchar(96) PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"tick" bigint DEFAULT 0 NOT NULL,
	"state_json" jsonb NOT NULL,
	"last_tick_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "economy_worlds_version_check" CHECK ("economy_worlds"."version" >= 1),
	CONSTRAINT "economy_worlds_tick_check" CHECK ("economy_worlds"."tick" >= 0)
);
--> statement-breakpoint
CREATE TABLE "player_boats" (
	"id" uuid PRIMARY KEY NOT NULL,
	"character_id" uuid NOT NULL,
	"boat_definition_id" varchar(128) NOT NULL,
	"name" varchar(96) NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"hp" integer NOT NULL,
	"max_hp" integer NOT NULL,
	"cargo_capacity" integer NOT NULL,
	"upgrades_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_boats_id_character_uq" UNIQUE("id","character_id"),
	CONSTRAINT "player_boats_level_check" CHECK ("player_boats"."level" >= 1),
	CONSTRAINT "player_boats_vitals_check" CHECK ("player_boats"."max_hp" > 0 and "player_boats"."hp" >= 0 and "player_boats"."hp" <= "player_boats"."max_hp" and "player_boats"."cargo_capacity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "player_cargo" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"character_id" uuid NOT NULL,
	"boat_id" uuid NOT NULL,
	"commodity_id" varchar(128) NOT NULL,
	"quantity" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_cargo_quantity_check" CHECK ("player_cargo"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "player_checkpoints" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"island_id" varchar(96) NOT NULL,
	"spawn_id" varchar(96) NOT NULL,
	"position_json" jsonb NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_equipment" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"character_id" uuid NOT NULL,
	"slot" varchar(64) NOT NULL,
	"item_id" varchar(128) NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_inventory" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"character_id" uuid NOT NULL,
	"item_id" varchar(128) NOT NULL,
	"quantity" integer NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_inventory_quantity_check" CHECK ("player_inventory"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "player_progression" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"exp" bigint DEFAULT 0 NOT NULL,
	"stat_points" integer DEFAULT 0 NOT NULL,
	"combat" integer DEFAULT 0 NOT NULL,
	"vitality" integer DEFAULT 0 NOT NULL,
	"blade" integer DEFAULT 0 NOT NULL,
	"ranged" integer DEFAULT 0 NOT NULL,
	"fruit_power" integer DEFAULT 0 NOT NULL,
	"mastery_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_progression_exp_check" CHECK ("player_progression"."exp" >= 0),
	CONSTRAINT "player_progression_stat_points_check" CHECK ("player_progression"."stat_points" >= 0),
	CONSTRAINT "player_progression_stats_check" CHECK ("player_progression"."combat" >= 0 and "player_progression"."vitality" >= 0 and "player_progression"."blade" >= 0 and "player_progression"."ranged" >= 0 and "player_progression"."fruit_power" >= 0)
);
--> statement-breakpoint
CREATE TABLE "player_quests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"character_id" uuid NOT NULL,
	"quest_id" varchar(128) NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"progress_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"repeat_available_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_quests_status_check" CHECK ("player_quests"."status" in ('active', 'completed', 'claimed', 'abandoned'))
);
--> statement-breakpoint
CREATE TABLE "player_stats" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"hp" integer NOT NULL,
	"max_hp" integer NOT NULL,
	"mp" integer NOT NULL,
	"max_mp" integer NOT NULL,
	"energy" integer NOT NULL,
	"max_energy" integer NOT NULL,
	"derived_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_stats_vitals_check" CHECK ("player_stats"."max_hp" > 0 and "player_stats"."hp" >= 0 and "player_stats"."hp" <= "player_stats"."max_hp" and "player_stats"."max_mp" >= 0 and "player_stats"."mp" >= 0 and "player_stats"."mp" <= "player_stats"."max_mp" and "player_stats"."max_energy" >= 0 and "player_stats"."energy" >= 0 and "player_stats"."energy" <= "player_stats"."max_energy")
);
--> statement-breakpoint
CREATE TABLE "schema_migrations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"name" varchar(160) NOT NULL,
	"checksum" varchar(128) NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schema_migrations_version_check" CHECK ("schema_migrations"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip_hash" varchar(128),
	"user_agent" varchar(512)
);
--> statement-breakpoint
CREATE TABLE "trade_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"character_id" uuid NOT NULL,
	"action" text NOT NULL,
	"island_id" varchar(96) NOT NULL,
	"commodity_id" varchar(128) NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(20, 4) NOT NULL,
	"fee" numeric(20, 4) DEFAULT '0' NOT NULL,
	"total" numeric(20, 4) NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trade_transactions_action_check" CHECK ("trade_transactions"."action" in ('buy', 'sell', 'import')),
	CONSTRAINT "trade_transactions_quantity_check" CHECK ("trade_transactions"."quantity" > 0),
	CONSTRAINT "trade_transactions_money_check" CHECK ("trade_transactions"."unit_price" >= 0 and "trade_transactions"."fee" >= 0 and "trade_transactions"."total" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "users_status_check" CHECK ("users"."status" in ('active', 'suspended', 'deleted'))
);
--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_snapshots" ADD CONSTRAINT "economy_snapshots_world_id_economy_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."economy_worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_boats" ADD CONSTRAINT "player_boats_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_cargo" ADD CONSTRAINT "player_cargo_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_cargo" ADD CONSTRAINT "player_cargo_boat_owner_fk" FOREIGN KEY ("boat_id","character_id") REFERENCES "public"."player_boats"("id","character_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_checkpoints" ADD CONSTRAINT "player_checkpoints_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_equipment" ADD CONSTRAINT "player_equipment_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_inventory" ADD CONSTRAINT "player_inventory_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_progression" ADD CONSTRAINT "player_progression_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_quests" ADD CONSTRAINT "player_quests_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_stats" ADD CONSTRAINT "player_stats_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_transactions" ADD CONSTRAINT "trade_transactions_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "characters_user_name_uq" ON "characters" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "characters_user_id_idx" ON "characters" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "characters_current_island_idx" ON "characters" USING btree ("current_island_id");--> statement-breakpoint
CREATE UNIQUE INDEX "economy_snapshots_world_tick_uq" ON "economy_snapshots" USING btree ("world_id","tick");--> statement-breakpoint
CREATE INDEX "economy_snapshots_world_created_idx" ON "economy_snapshots" USING btree ("world_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "player_boats_character_definition_uq" ON "player_boats" USING btree ("character_id","boat_definition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_boats_one_active_uq" ON "player_boats" USING btree ("character_id") WHERE "player_boats"."is_active" = true;--> statement-breakpoint
CREATE INDEX "player_boats_character_idx" ON "player_boats" USING btree ("character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_cargo_character_boat_commodity_uq" ON "player_cargo" USING btree ("character_id","boat_id","commodity_id");--> statement-breakpoint
CREATE INDEX "player_cargo_boat_idx" ON "player_cargo" USING btree ("boat_id");--> statement-breakpoint
CREATE INDEX "player_cargo_commodity_idx" ON "player_cargo" USING btree ("commodity_id");--> statement-breakpoint
CREATE INDEX "player_checkpoints_island_spawn_idx" ON "player_checkpoints" USING btree ("island_id","spawn_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_equipment_character_slot_uq" ON "player_equipment" USING btree ("character_id","slot");--> statement-breakpoint
CREATE INDEX "player_equipment_item_idx" ON "player_equipment" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_inventory_character_item_uq" ON "player_inventory" USING btree ("character_id","item_id");--> statement-breakpoint
CREATE INDEX "player_inventory_item_idx" ON "player_inventory" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "player_progression_level_lookup_idx" ON "player_progression" USING btree ("exp");--> statement-breakpoint
CREATE UNIQUE INDEX "player_quests_character_quest_uq" ON "player_quests" USING btree ("character_id","quest_id");--> statement-breakpoint
CREATE INDEX "player_quests_character_status_idx" ON "player_quests" USING btree ("character_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "schema_migrations_version_uq" ON "schema_migrations" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX "schema_migrations_name_uq" ON "schema_migrations" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trade_transactions_character_idempotency_uq" ON "trade_transactions" USING btree ("character_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "trade_transactions_character_created_idx" ON "trade_transactions" USING btree ("character_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "trade_transactions_market_created_idx" ON "trade_transactions" USING btree ("island_id","commodity_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");