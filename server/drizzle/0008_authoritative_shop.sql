CREATE TABLE "shop_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"character_id" uuid NOT NULL,
	"action" text NOT NULL,
	"item_id" varchar(128) NOT NULL,
	"quantity" integer NOT NULL,
	"cost" bigint NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"result_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_transactions_action_check" CHECK ("shop_transactions"."action" in ('draw', 'potion')),
	CONSTRAINT "shop_transactions_values_check" CHECK ("shop_transactions"."quantity" > 0 and "shop_transactions"."cost" >= 0)
);
ALTER TABLE "shop_transactions" ADD CONSTRAINT "shop_transactions_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE restrict ON UPDATE no action;
CREATE UNIQUE INDEX "shop_transactions_character_idempotency_uq" ON "shop_transactions" USING btree ("character_id","idempotency_key");
CREATE INDEX "shop_transactions_character_created_idx" ON "shop_transactions" USING btree ("character_id","created_at" DESC NULLS LAST);
