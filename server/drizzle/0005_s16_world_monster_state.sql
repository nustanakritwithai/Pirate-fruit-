CREATE TABLE IF NOT EXISTS "world_monster_state" (
	"spawn_id" varchar(96) PRIMARY KEY NOT NULL,
	"island_id" varchar(96) NOT NULL,
	"monster_id" varchar(96) NOT NULL,
	"hp" integer NOT NULL,
	"state" varchar(24) NOT NULL,
	"x" real NOT NULL,
	"z" real NOT NULL,
	"respawn_at" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
