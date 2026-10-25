CREATE TYPE "public"."photo_status" AS ENUM('uploading', 'pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "profile_photos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"position" smallint NOT NULL,
	"status" "photo_status" DEFAULT 'uploading' NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer,
	"width" smallint,
	"height" smallint,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_photos_storage_key_unique" UNIQUE("storage_key"),
	-- Hand edit: deferrable so a reorder can swap positions inside one transaction
	-- (SET CONSTRAINTS profile_photos_user_position DEFERRED). Drizzle cannot express this.
	CONSTRAINT "profile_photos_user_position" UNIQUE("user_id","position") DEFERRABLE INITIALLY IMMEDIATE,
	CONSTRAINT "profile_photos_position_range" CHECK ("profile_photos"."position" BETWEEN 1 AND 6)
);
--> statement-breakpoint
ALTER TABLE "profile_photos" ADD CONSTRAINT "profile_photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profile_photos_status_idx" ON "profile_photos" USING btree ("status","created_at") WHERE "profile_photos"."status" IN ('uploading', 'pending');