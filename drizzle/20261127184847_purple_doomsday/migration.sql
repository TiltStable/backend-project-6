CREATE TABLE "task_statuses" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
