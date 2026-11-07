CREATE TABLE "backups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"filename" text,
	"size_bytes" integer,
	"status" text NOT NULL,
	"error" text,
	"trigger" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_days" (
	"day" text PRIMARY KEY NOT NULL,
	"closed_by" uuid,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"summary" jsonb NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"value" numeric(10, 2) NOT NULL,
	"min_order" numeric(10, 2) DEFAULT '0' NOT NULL,
	"max_uses" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "loyalty_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "business_days" ADD CONSTRAINT "business_days_closed_by_profiles_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;