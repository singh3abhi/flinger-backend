CREATE TYPE "public"."consent_document" AS ENUM('terms', 'privacy', 'guidelines');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('woman', 'man', 'non_binary');--> statement-breakpoint
CREATE TYPE "public"."profile_attribute_kind" AS ENUM('interested_in', 'hoping_to_find', 'values', 'causes');--> statement-breakpoint
CREATE TYPE "public"."profile_visibility" AS ENUM('visible', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('none', 'pending', 'verified');--> statement-breakpoint
CREATE TABLE "profile_attributes" (
	"user_id" uuid NOT NULL,
	"kind" "profile_attribute_kind" NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "profile_attributes_user_id_kind_value_pk" PRIMARY KEY("user_id","kind","value")
);
--> statement-breakpoint
CREATE TABLE "profile_prompts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"prompt_id" text NOT NULL,
	"answer" text NOT NULL,
	"position" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_prompts_user_position" UNIQUE("user_id","position"),
	CONSTRAINT "profile_prompts_user_prompt" UNIQUE("user_id","prompt_id"),
	CONSTRAINT "profile_prompts_position_range" CHECK ("profile_prompts"."position" BETWEEN 1 AND 3),
	CONSTRAINT "profile_prompts_answer_len" CHECK (char_length("profile_prompts"."answer") BETWEEN 1 AND 150)
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"birth_date" date,
	"gender" "gender",
	"dating_mode" text DEFAULT 'dating' NOT NULL,
	"height_cm" smallint,
	"kids_status" text,
	"family_plans" text,
	"religion" text,
	"politics" text,
	"bio" text,
	"visibility" "profile_visibility" DEFAULT 'visible' NOT NULL,
	"verification_status" "verification_status" DEFAULT 'none' NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_display_name_len" CHECK (char_length("profiles"."display_name") BETWEEN 2 AND 30),
	CONSTRAINT "profiles_birth_date_range" CHECK ("profiles"."birth_date" >= '1900-01-01'),
	CONSTRAINT "profiles_height_range" CHECK ("profiles"."height_cm" BETWEEN 120 AND 230),
	CONSTRAINT "profiles_bio_len" CHECK (char_length("profiles"."bio") <= 500)
);
--> statement-breakpoint
CREATE TABLE "prompts" (
	"id" text PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"category" text NOT NULL,
	"sort_order" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_consents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"document" "consent_document" NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_consents_user_document_version" UNIQUE("user_id","document","version")
);
--> statement-breakpoint
ALTER TABLE "profile_attributes" ADD CONSTRAINT "profile_attributes_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_prompts" ADD CONSTRAINT "profile_prompts_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_prompts" ADD CONSTRAINT "profile_prompts_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;