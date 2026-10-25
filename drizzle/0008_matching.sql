CREATE TYPE "public"."like_item_type" AS ENUM('photo', 'prompt');--> statement-breakpoint
CREATE TYPE "public"."swipe_direction" AS ENUM('like', 'pass');--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_a" uuid NOT NULL,
	"user_b" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unmatched_at" timestamp with time zone,
	"unmatched_by" uuid,
	CONSTRAINT "matches_pair" UNIQUE("user_a","user_b"),
	CONSTRAINT "matches_ordered_pair" CHECK ("matches"."user_a" < "matches"."user_b")
);
--> statement-breakpoint
CREATE TABLE "swipes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"swiper_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"direction" "swipe_direction" NOT NULL,
	"item_type" "like_item_type",
	"item_id" uuid,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "swipes_pair" UNIQUE("swiper_id","target_id"),
	CONSTRAINT "swipes_not_self" CHECK ("swipes"."swiper_id" <> "swipes"."target_id"),
	CONSTRAINT "swipes_like_has_item" CHECK (("swipes"."direction" = 'like') = ("swipes"."item_type" IS NOT NULL AND "swipes"."item_id" IS NOT NULL)),
	CONSTRAINT "swipes_comment_len" CHECK (char_length("swipes"."comment") <= 150)
);
--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_user_a_users_id_fk" FOREIGN KEY ("user_a") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_user_b_users_id_fk" FOREIGN KEY ("user_b") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_unmatched_by_users_id_fk" FOREIGN KEY ("unmatched_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swipes" ADD CONSTRAINT "swipes_swiper_id_users_id_fk" FOREIGN KEY ("swiper_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swipes" ADD CONSTRAINT "swipes_target_id_users_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "matches_user_b_idx" ON "matches" USING btree ("user_b");--> statement-breakpoint
CREATE INDEX "swipes_likes_received_idx" ON "swipes" USING btree ("target_id","created_at") WHERE "swipes"."direction" = 'like';