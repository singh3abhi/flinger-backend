CREATE TABLE "preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"min_age" smallint NOT NULL,
	"max_age" smallint NOT NULL,
	"max_distance_km" smallint NOT NULL,
	"show_distance" boolean DEFAULT true NOT NULL,
	"expand_radius_when_empty" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preferences_age_range" CHECK ("preferences"."min_age" BETWEEN 18 AND 99 AND "preferences"."max_age" BETWEEN 18 AND 99 AND "preferences"."min_age" <= "preferences"."max_age"),
	CONSTRAINT "preferences_distance_range" CHECK ("preferences"."max_distance_km" BETWEEN 1 AND 200)
);
--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;