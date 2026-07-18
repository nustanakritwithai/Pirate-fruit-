CREATE TABLE IF NOT EXISTS "world_boat_state" (
	"boat_id" uuid PRIMARY KEY NOT NULL REFERENCES "player_boats"("id") ON DELETE CASCADE,
	"owner_id" uuid NOT NULL REFERENCES "characters"("id") ON DELETE CASCADE,
	"definition_id" varchar(128) NOT NULL,
	"island_id" varchar(96) NOT NULL,
	"x" real NOT NULL,
	"z" real NOT NULL,
	"heading" real NOT NULL,
	"speed" real DEFAULT 0 NOT NULL,
	"hp" integer NOT NULL,
	"max_hp" integer NOT NULL,
	"anchor" boolean DEFAULT true NOT NULL,
	"state" varchar(24) DEFAULT 'docked' NOT NULL,
	"helm_id" uuid REFERENCES "characters"("id") ON DELETE SET NULL,
	"passenger_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"respawn_at" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "world_boat_vitals_check" CHECK ("max_hp" > 0 AND "hp" >= 0 AND "hp" <= "max_hp"),
	CONSTRAINT "world_boat_state_check" CHECK ("state" IN ('docked', 'sailing', 'sunk', 'respawning'))
);
CREATE INDEX IF NOT EXISTS "world_boat_island_idx" ON "world_boat_state" ("island_id");
CREATE INDEX IF NOT EXISTS "world_boat_owner_idx" ON "world_boat_state" ("owner_id");
