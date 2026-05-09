import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import type {
  AnswerType,
  AnswerValue,
  AssessmentResult,
  Payment,
  SessionStatus,
  SubscriptionStatus
} from "../domain/types";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    anonymousId: text("anonymous_id").notNull(),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    anonymousIdUnique: uniqueIndex("users_anonymous_id_key").on(table.anonymousId),
    anonymousIdIndex: index("users_anonymous_id_idx").on(table.anonymousId)
  })
);

export const funnels = pgTable(
  "funnels",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    version: integer("version").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    slugUnique: uniqueIndex("funnels_slug_key").on(table.slug)
  })
);

export const funnelSteps = pgTable(
  "funnel_steps",
  {
    id: text("id").primaryKey(),
    flowId: text("flow_id")
      .notNull()
      .references(() => funnels.id, { onDelete: "cascade" }),
    sourceId: text("source_id"),
    stepIndex: integer("step_index").notNull(),
    type: text("type").$type<"info" | "question" | "loader">().notNull(),
    questionKey: text("question_key"),
    questionType: text("question_type").$type<AnswerType>(),
    title: text("title").notNull(),
    description: text("description"),
    imageUrl: text("image_url"),
    questionImageUrl: text("question_image_url"),
    required: boolean("required").notNull().default(false),
    inputConfig: jsonb("input_config")
      .$type<{ unit?: string; min?: number; max?: number; placeholder?: string }>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    flowStepUnique: unique("funnel_steps_flow_id_step_index_key").on(table.flowId, table.stepIndex),
    flowQuestionUnique: unique("funnel_steps_flow_id_question_key_key").on(table.flowId, table.questionKey),
    flowIndex: index("funnel_steps_flow_id_idx").on(table.flowId, table.stepIndex),
    typeCheck: check("funnel_steps_type_check", sql`${table.type} in ('info', 'question', 'loader')`),
    questionTypeCheck: check(
      "funnel_steps_question_type_check",
      sql`${table.questionType} in ('single_select', 'multi_select', 'input')`
    )
  })
);

export const answerOptions = pgTable(
  "answer_options",
  {
    id: text("id").primaryKey(),
    stepId: text("step_id")
      .notNull()
      .references(() => funnelSteps.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    iconUrl: text("icon_url"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    stepValueUnique: unique("answer_options_step_id_value_key").on(table.stepId, table.value),
    stepIndex: index("answer_options_step_id_idx").on(table.stepId, table.sortOrder)
  })
);

export const assessmentSessions = pgTable(
  "assessment_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    anonymousId: text("anonymous_id").notNull(),
    flowId: text("flow_id")
      .notNull()
      .default("default")
      .references(() => funnels.id, { onDelete: "restrict" }),
    status: text("status").$type<SessionStatus>().notNull().default("in_progress"),
    currentStepIndex: integer("current_step_index").notNull().default(0),
    subscriptionStatus: text("subscription_status")
      .$type<SubscriptionStatus>()
      .notNull()
      .default("inactive"),
    submittedAt: timestamp("submitted_at", { mode: "string", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    anonymousIdUnique: uniqueIndex("assessment_sessions_anonymous_id_key").on(table.anonymousId),
    userIndex: index("assessment_sessions_user_id_idx").on(table.userId, table.updatedAt),
    flowIndex: index("assessment_sessions_flow_id_idx").on(table.flowId),
    activeSubscriptionIndex: index("assessment_sessions_active_subscription_idx")
      .on(table.updatedAt)
      .where(sql`${table.subscriptionStatus} = 'active'`),
    statusCheck: check(
      "assessment_sessions_status_check",
      sql`${table.status} in ('in_progress', 'submitted', 'result_ready', 'expired')`
    ),
    currentStepIndexCheck: check(
      "assessment_sessions_current_step_index_check",
      sql`${table.currentStepIndex} >= 0`
    ),
    subscriptionStatusCheck: check(
      "assessment_sessions_subscription_status_check",
      sql`${table.subscriptionStatus} in ('inactive', 'active', 'cancelled', 'refunded')`
    )
  })
);

export const assessmentAnswers = pgTable(
  "assessment_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => assessmentSessions.id, { onDelete: "cascade" }),
    questionKey: text("question_key").notNull(),
    questionId: text("question_id").notNull(),
    stepIndex: integer("step_index").notNull(),
    answerType: text("answer_type").$type<AnswerType>().notNull(),
    value: jsonb("value").$type<AnswerValue>().notNull(),
    answeredAt: timestamp("answered_at", { mode: "string", withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    sessionQuestionUnique: unique("assessment_answers_session_id_question_key_key").on(
      table.sessionId,
      table.questionKey
    ),
    sessionIndex: index("assessment_answers_session_id_idx").on(table.sessionId, table.stepIndex),
    stepIndexCheck: check("assessment_answers_step_index_check", sql`${table.stepIndex} >= 0`),
    answerTypeCheck: check(
      "assessment_answers_answer_type_check",
      sql`${table.answerType} in ('single_select', 'multi_select', 'input')`
    )
  })
);

export const assessmentResults = pgTable(
  "assessment_results",
  {
    sessionId: uuid("session_id")
      .primaryKey()
      .references(() => assessmentSessions.id, { onDelete: "cascade" }),
    bmi: numeric("bmi", { precision: 5, scale: 2 }).$type<number>().notNull(),
    bmiCategory: text("bmi_category").$type<AssessmentResult["bmiCategory"]>().notNull(),
    bmr: numeric("bmr", { precision: 8, scale: 2 }).$type<number>().notNull(),
    tdee: numeric("tdee", { precision: 8, scale: 2 }).$type<number>().notNull(),
    recommendedCalories: integer("recommended_calories").notNull(),
    targetDate: date("target_date", { mode: "string" }).notNull(),
    estimatedWeeks: integer("estimated_weeks").notNull(),
    estimatedWeeksRange: text("estimated_weeks_range").notNull(),
    summary: jsonb("summary").$type<AssessmentResult["summary"]>().notNull().default({
      headline: "",
      body: "",
      riskFlags: []
    }),
    projectionCurve: jsonb("projection_curve")
      .$type<AssessmentResult["projectionCurve"]>()
      .notNull()
      .default([]),
    recommendations: jsonb("recommendations")
      .$type<AssessmentResult["recommendations"]>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    sessionIndex: index("assessment_results_session_id_idx").on(table.sessionId),
    bmiCheck: check("assessment_results_bmi_check", sql`${table.bmi} > 0`),
    bmiCategoryCheck: check(
      "assessment_results_bmi_category_check",
      sql`${table.bmiCategory} in ('underweight', 'normal', 'overweight', 'obese')`
    ),
    caloriesCheck: check("assessment_results_recommended_calories_check", sql`${table.recommendedCalories} > 0`),
    estimatedWeeksCheck: check("assessment_results_estimated_weeks_check", sql`${table.estimatedWeeks} > 0`)
  })
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => assessmentSessions.id, { onDelete: "cascade" }),
    provider: text("provider").$type<Payment["provider"]>().notNull().default("mock"),
    providerEventId: text("provider_event_id").notNull(),
    providerOrderId: text("provider_order_id"),
    providerCaptureId: text("provider_capture_id"),
    status: text("status").$type<Payment["status"]>().notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    rawPayload: jsonb("raw_payload").$type<unknown>().notNull().default({}),
    paidAt: timestamp("paid_at", { mode: "string", withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    providerEventUnique: uniqueIndex("payments_provider_event_id_key").on(table.providerEventId),
    sessionIndex: index("payments_session_id_idx").on(table.sessionId, table.createdAt),
    providerCheck: check("payments_provider_check", sql`${table.provider} in ('mock', 'paypal')`),
    statusCheck: check("payments_status_check", sql`${table.status} in ('created', 'succeeded', 'failed', 'refunded')`),
    amountCheck: check("payments_amount_cents_check", sql`${table.amountCents} > 0`),
    currencyCheck: check("payments_currency_check", sql`length(${table.currency}) = 3`)
  })
);
