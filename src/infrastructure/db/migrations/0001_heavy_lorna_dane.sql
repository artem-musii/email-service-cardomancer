CREATE TABLE "email_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"html" text NOT NULL,
	"variables" text[] DEFAULT '{}' NOT NULL,
	"max_retries" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_templates_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "email_log" ADD COLUMN "subject" varchar(500);--> statement-breakpoint
ALTER TABLE "email_log" ADD COLUMN "attempt" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "email_log" ADD COLUMN "max_retries" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "email_log" ADD COLUMN "variables" jsonb;--> statement-breakpoint
ALTER TABLE "email_log" ADD COLUMN "from_email" varchar(255);--> statement-breakpoint
ALTER TABLE "email_log" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;