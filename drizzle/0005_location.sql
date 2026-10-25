-- Hand edit: drizzle-kit quotes custom types; geography(Point,4326) must be unquoted.
CREATE TABLE "places" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "places_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"geoname_id" integer,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"state" text NOT NULL,
	"population" integer,
	"location" geography(Point,4326) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "places_geoname_id_unique" UNIQUE("geoname_id")
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "location" geography(Point,4326);--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "location_accuracy_m" double precision;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "location_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "place_id" integer;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "location_flagged_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "places_location_gix" ON "places" USING gist ("location");--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profiles_location_gix" ON "profiles" USING gist ("location");