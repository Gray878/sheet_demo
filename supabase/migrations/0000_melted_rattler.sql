CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--> statement-breakpoint
CREATE TABLE "answer_options" (
	"id" text PRIMARY KEY NOT NULL,
	"step_id" text NOT NULL,
	"value" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"icon_url" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "answer_options_step_id_value_key" UNIQUE("step_id","value")
);
--> statement-breakpoint
CREATE TABLE "assessment_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"question_key" text NOT NULL,
	"question_id" text NOT NULL,
	"step_index" integer NOT NULL,
	"answer_type" text NOT NULL,
	"value" jsonb NOT NULL,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_answers_session_id_question_key_key" UNIQUE("session_id","question_key"),
	CONSTRAINT "assessment_answers_step_index_check" CHECK ("assessment_answers"."step_index" >= 0),
	CONSTRAINT "assessment_answers_answer_type_check" CHECK ("assessment_answers"."answer_type" in ('single_select', 'multi_select', 'input'))
);
--> statement-breakpoint
CREATE TABLE "assessment_results" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"bmi" numeric(5, 2) NOT NULL,
	"bmi_category" text NOT NULL,
	"bmr" numeric(8, 2) NOT NULL,
	"tdee" numeric(8, 2) NOT NULL,
	"recommended_calories" integer NOT NULL,
	"target_date" date NOT NULL,
	"estimated_weeks" integer NOT NULL,
	"estimated_weeks_range" text NOT NULL,
	"summary" jsonb DEFAULT '{"headline":"","body":"","riskFlags":[]}'::jsonb NOT NULL,
	"projection_curve" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recommendations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_results_bmi_check" CHECK ("assessment_results"."bmi" > 0),
	CONSTRAINT "assessment_results_bmi_category_check" CHECK ("assessment_results"."bmi_category" in ('underweight', 'normal', 'overweight', 'obese')),
	CONSTRAINT "assessment_results_recommended_calories_check" CHECK ("assessment_results"."recommended_calories" > 0),
	CONSTRAINT "assessment_results_estimated_weeks_check" CHECK ("assessment_results"."estimated_weeks" > 0)
);
--> statement-breakpoint
CREATE TABLE "assessment_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"anonymous_id" text NOT NULL,
	"flow_id" text DEFAULT 'default' NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"current_step_index" integer DEFAULT 0 NOT NULL,
	"subscription_status" text DEFAULT 'inactive' NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_sessions_status_check" CHECK ("assessment_sessions"."status" in ('in_progress', 'submitted', 'result_ready', 'expired')),
	CONSTRAINT "assessment_sessions_current_step_index_check" CHECK ("assessment_sessions"."current_step_index" >= 0),
	CONSTRAINT "assessment_sessions_subscription_status_check" CHECK ("assessment_sessions"."subscription_status" in ('inactive', 'active', 'cancelled', 'refunded'))
);
--> statement-breakpoint
CREATE TABLE "funnel_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"flow_id" text NOT NULL,
	"source_id" text,
	"step_index" integer NOT NULL,
	"type" text NOT NULL,
	"question_key" text,
	"question_type" text,
	"title" text NOT NULL,
	"description" text,
	"image_url" text,
	"question_image_url" text,
	"required" boolean DEFAULT false NOT NULL,
	"input_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "funnel_steps_flow_id_step_index_key" UNIQUE("flow_id","step_index"),
	CONSTRAINT "funnel_steps_flow_id_question_key_key" UNIQUE("flow_id","question_key"),
	CONSTRAINT "funnel_steps_type_check" CHECK ("funnel_steps"."type" in ('info', 'question', 'loader')),
	CONSTRAINT "funnel_steps_question_type_check" CHECK ("funnel_steps"."question_type" in ('single_select', 'multi_select', 'input'))
);
--> statement-breakpoint
CREATE TABLE "funnels" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"provider" text DEFAULT 'mock' NOT NULL,
	"provider_event_id" text NOT NULL,
	"provider_order_id" text,
	"provider_capture_id" text,
	"status" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"raw_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_provider_check" CHECK ("payments"."provider" in ('mock', 'paypal')),
	CONSTRAINT "payments_status_check" CHECK ("payments"."status" in ('created', 'succeeded', 'failed', 'refunded')),
	CONSTRAINT "payments_amount_cents_check" CHECK ("payments"."amount_cents" > 0),
	CONSTRAINT "payments_currency_check" CHECK (length("payments"."currency") = 3)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anonymous_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "answer_options" ADD CONSTRAINT "answer_options_step_id_funnel_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."funnel_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_answers" ADD CONSTRAINT "assessment_answers_session_id_assessment_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."assessment_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_results" ADD CONSTRAINT "assessment_results_session_id_assessment_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."assessment_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sessions" ADD CONSTRAINT "assessment_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_sessions" ADD CONSTRAINT "assessment_sessions_flow_id_funnels_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."funnels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funnel_steps" ADD CONSTRAINT "funnel_steps_flow_id_funnels_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."funnels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_session_id_assessment_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."assessment_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "answer_options_step_id_idx" ON "answer_options" USING btree ("step_id","sort_order");--> statement-breakpoint
CREATE INDEX "assessment_answers_session_id_idx" ON "assessment_answers" USING btree ("session_id","step_index");--> statement-breakpoint
CREATE INDEX "assessment_results_session_id_idx" ON "assessment_results" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_sessions_anonymous_id_key" ON "assessment_sessions" USING btree ("anonymous_id");--> statement-breakpoint
CREATE INDEX "assessment_sessions_user_id_idx" ON "assessment_sessions" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "assessment_sessions_flow_id_idx" ON "assessment_sessions" USING btree ("flow_id");--> statement-breakpoint
CREATE INDEX "assessment_sessions_active_subscription_idx" ON "assessment_sessions" USING btree ("updated_at") WHERE "assessment_sessions"."subscription_status" = 'active';--> statement-breakpoint
CREATE INDEX "funnel_steps_flow_id_idx" ON "funnel_steps" USING btree ("flow_id","step_index");--> statement-breakpoint
CREATE UNIQUE INDEX "funnels_slug_key" ON "funnels" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_event_id_key" ON "payments" USING btree ("provider_event_id");--> statement-breakpoint
CREATE INDEX "payments_session_id_idx" ON "payments" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_anonymous_id_key" ON "users" USING btree ("anonymous_id");--> statement-breakpoint
CREATE INDEX "users_anonymous_id_idx" ON "users" USING btree ("anonymous_id");--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "funnels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "funnel_steps" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "answer_options" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assessment_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assessment_answers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assessment_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
