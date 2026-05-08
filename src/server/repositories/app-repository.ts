import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { notFound } from "@/src/server/domain/errors";
import type {
  AssessmentAnswer,
  AssessmentResult,
  AssessmentSession,
  Payment,
  SubscriptionStatus
} from "@/src/server/domain/types";
import type { AnswerInput } from "@/src/server/validation/answer-schema";

export interface AppRepository {
  createSession(): Promise<AssessmentSession>;
  getSession(sessionId: string): Promise<AssessmentSession | null>;
  listAnswers(sessionId: string): Promise<AssessmentAnswer[]>;
  upsertAnswers(
    sessionId: string,
    currentStepIndex: number,
    answers: AnswerInput[]
  ): Promise<AssessmentAnswer[]>;
  markResultReady(sessionId: string): Promise<AssessmentSession>;
  upsertResult(result: AssessmentResult): Promise<AssessmentResult>;
  getResult(sessionId: string): Promise<AssessmentResult | null>;
  activateSubscription(input: {
    sessionId: string;
    providerEventId: string;
    amountCents: number;
    currency: string;
    rawPayload: unknown;
  }): Promise<{ session: AssessmentSession; payment: Payment }>;
}

type DevDb = {
  sessions: AssessmentSession[];
  answers: AssessmentAnswer[];
  results: AssessmentResult[];
  payments: Payment[];
};

const emptyDb: DevDb = {
  sessions: [],
  answers: [],
  results: [],
  payments: []
};

function now() {
  return new Date().toISOString();
}

function localDbPath() {
  return join(process.cwd(), "data", "dev-db.json");
}

async function readDevDb(): Promise<DevDb> {
  const path = localDbPath();

  try {
    return JSON.parse(await readFile(path, "utf8")) as DevDb;
  } catch {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(emptyDb, null, 2)}\n`, "utf8");
    return structuredClone(emptyDb);
  }
}

async function writeDevDb(db: DevDb) {
  const path = localDbPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(db, null, 2)}\n`, "utf8");
}

class FileRepository implements AppRepository {
  async createSession() {
    const db = await readDevDb();
    const timestamp = now();
    const session: AssessmentSession = {
      id: crypto.randomUUID(),
      anonymousId: crypto.randomUUID(),
      flowId: "default",
      status: "in_progress",
      currentStepIndex: 0,
      subscriptionStatus: "inactive",
      submittedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    db.sessions.push(session);
    await writeDevDb(db);
    return session;
  }

  async getSession(sessionId: string) {
    const db = await readDevDb();
    return db.sessions.find((session) => session.id === sessionId) ?? null;
  }

  async listAnswers(sessionId: string) {
    const db = await readDevDb();
    return db.answers
      .filter((answer) => answer.sessionId === sessionId)
      .sort((a, b) => a.stepIndex - b.stepIndex);
  }

  async upsertAnswers(sessionId: string, currentStepIndex: number, answers: AnswerInput[]) {
    const db = await readDevDb();
    const session = db.sessions.find((item) => item.id === sessionId);
    if (!session) throw notFound("Session not found");

    const timestamp = now();
    const savedAnswers: AssessmentAnswer[] = [];

    for (const answer of answers) {
      const existing = db.answers.find(
        (item) => item.sessionId === sessionId && item.questionKey === answer.questionKey
      );

      if (existing) {
        existing.questionId = answer.questionId;
        existing.stepIndex = answer.stepIndex;
        existing.answerType = answer.answerType;
        existing.value = answer.value;
        existing.answeredAt = timestamp;
        existing.updatedAt = timestamp;
        savedAnswers.push(existing);
      } else {
        const created: AssessmentAnswer = {
          id: crypto.randomUUID(),
          sessionId,
          questionKey: answer.questionKey,
          questionId: answer.questionId,
          stepIndex: answer.stepIndex,
          answerType: answer.answerType,
          value: answer.value,
          answeredAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp
        };
        db.answers.push(created);
        savedAnswers.push(created);
      }
    }

    session.currentStepIndex = Math.max(session.currentStepIndex, currentStepIndex);
    session.updatedAt = timestamp;
    await writeDevDb(db);
    return savedAnswers;
  }

  async markResultReady(sessionId: string) {
    const db = await readDevDb();
    const session = db.sessions.find((item) => item.id === sessionId);
    if (!session) throw notFound("Session not found");

    const timestamp = now();
    session.status = "result_ready";
    session.submittedAt = session.submittedAt ?? timestamp;
    session.updatedAt = timestamp;
    await writeDevDb(db);
    return session;
  }

  async upsertResult(result: AssessmentResult) {
    const db = await readDevDb();
    const index = db.results.findIndex((item) => item.sessionId === result.sessionId);

    if (index >= 0) db.results[index] = result;
    else db.results.push(result);

    await writeDevDb(db);
    return result;
  }

  async getResult(sessionId: string) {
    const db = await readDevDb();
    return db.results.find((result) => result.sessionId === sessionId) ?? null;
  }

  async activateSubscription(input: {
    sessionId: string;
    providerEventId: string;
    amountCents: number;
    currency: string;
    rawPayload: unknown;
  }) {
    const db = await readDevDb();
    const session = db.sessions.find((item) => item.id === input.sessionId);
    if (!session) throw notFound("Session not found");

    const timestamp = now();
    let payment = db.payments.find((item) => item.providerEventId === input.providerEventId);

    if (!payment) {
      payment = {
        id: crypto.randomUUID(),
        sessionId: input.sessionId,
        provider: "mock",
        providerEventId: input.providerEventId,
        providerOrderId: null,
        providerCaptureId: null,
        status: "succeeded",
        amountCents: input.amountCents,
        currency: input.currency.toUpperCase(),
        rawPayload: input.rawPayload,
        paidAt: timestamp,
        createdAt: timestamp
      };
      db.payments.push(payment);
    }

    session.subscriptionStatus = "active";
    session.updatedAt = timestamp;
    await writeDevDb(db);
    return { session, payment };
  }
}

type SessionRow = {
  id: string;
  anonymous_id: string;
  flow_id: string;
  status: AssessmentSession["status"];
  current_step_index: number;
  subscription_status: SubscriptionStatus;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

type AnswerRow = {
  id: string;
  session_id: string;
  question_key: string;
  question_id: string;
  step_index: number;
  answer_type: AssessmentAnswer["answerType"];
  value: AssessmentAnswer["value"];
  answered_at: string;
  created_at: string;
  updated_at: string;
};

type ResultRow = {
  session_id: string;
  bmi: number;
  bmi_category: AssessmentResult["bmiCategory"];
  bmr: number;
  tdee: number;
  recommended_calories: number;
  target_date: string;
  estimated_weeks: number;
  estimated_weeks_range: string;
  summary: AssessmentResult["summary"];
  projection_curve: AssessmentResult["projectionCurve"];
  recommendations: string[];
  created_at: string;
  updated_at: string;
};

type PaymentRow = {
  id: string;
  session_id: string;
  provider: Payment["provider"];
  provider_event_id: string;
  provider_order_id: string | null;
  provider_capture_id: string | null;
  status: Payment["status"];
  amount_cents: number;
  currency: string;
  raw_payload: unknown;
  paid_at: string;
  created_at: string;
};

function mapSession(row: SessionRow): AssessmentSession {
  return {
    id: row.id,
    anonymousId: row.anonymous_id,
    flowId: row.flow_id,
    status: row.status,
    currentStepIndex: row.current_step_index,
    subscriptionStatus: row.subscription_status,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAnswer(row: AnswerRow): AssessmentAnswer {
  return {
    id: row.id,
    sessionId: row.session_id,
    questionKey: row.question_key,
    questionId: row.question_id,
    stepIndex: row.step_index,
    answerType: row.answer_type,
    value: row.value,
    answeredAt: row.answered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapResult(row: ResultRow): AssessmentResult {
  return {
    sessionId: row.session_id,
    bmi: Number(row.bmi),
    bmiCategory: row.bmi_category,
    bmr: Number(row.bmr),
    tdee: Number(row.tdee),
    recommendedCalories: row.recommended_calories,
    targetDate: row.target_date,
    estimatedWeeks: row.estimated_weeks,
    estimatedWeeksRange: row.estimated_weeks_range,
    summary: row.summary,
    projectionCurve: row.projection_curve,
    recommendations: row.recommendations,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    sessionId: row.session_id,
    provider: row.provider,
    providerEventId: row.provider_event_id,
    providerOrderId: row.provider_order_id,
    providerCaptureId: row.provider_capture_id,
    status: row.status,
    amountCents: row.amount_cents,
    currency: row.currency,
    rawPayload: row.raw_payload,
    paidAt: row.paid_at,
    createdAt: row.created_at
  };
}

class SupabaseRepository implements AppRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async createSession() {
    const timestamp = now();
    const { data, error } = await this.supabase
      .from("assessment_sessions")
      .insert({
        id: crypto.randomUUID(),
        anonymous_id: crypto.randomUUID(),
        flow_id: "default",
        status: "in_progress",
        current_step_index: 0,
        subscription_status: "inactive",
        submitted_at: null,
        created_at: timestamp,
        updated_at: timestamp
      })
      .select()
      .single<SessionRow>();

    if (error) throw new Error(error.message);
    return mapSession(data);
  }

  async getSession(sessionId: string) {
    const { data, error } = await this.supabase
      .from("assessment_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle<SessionRow>();

    if (error) throw new Error(error.message);
    return data ? mapSession(data) : null;
  }

  async listAnswers(sessionId: string) {
    const { data, error } = await this.supabase
      .from("assessment_answers")
      .select("*")
      .eq("session_id", sessionId)
      .order("step_index", { ascending: true })
      .returns<AnswerRow[]>();

    if (error) throw new Error(error.message);
    return data.map(mapAnswer);
  }

  async upsertAnswers(sessionId: string, currentStepIndex: number, answers: AnswerInput[]) {
    const session = await this.getSession(sessionId);
    if (!session) throw notFound("Session not found");

    const timestamp = now();
    const rows = answers.map((answer) => ({
      session_id: sessionId,
      question_key: answer.questionKey,
      question_id: answer.questionId,
      step_index: answer.stepIndex,
      answer_type: answer.answerType,
      value: answer.value,
      answered_at: timestamp,
      updated_at: timestamp
    }));

    const { data, error } = await this.supabase
      .from("assessment_answers")
      .upsert(rows, { onConflict: "session_id,question_key" })
      .select()
      .returns<AnswerRow[]>();

    if (error) throw new Error(error.message);

    const { error: sessionError } = await this.supabase
      .from("assessment_sessions")
      .update({
        current_step_index: Math.max(session.currentStepIndex, currentStepIndex),
        updated_at: timestamp
      })
      .eq("id", sessionId);

    if (sessionError) throw new Error(sessionError.message);
    return data.map(mapAnswer);
  }

  async markResultReady(sessionId: string) {
    const timestamp = now();
    const { data, error } = await this.supabase
      .from("assessment_sessions")
      .update({
        status: "result_ready",
        submitted_at: timestamp,
        updated_at: timestamp
      })
      .eq("id", sessionId)
      .select()
      .single<SessionRow>();

    if (error) throw new Error(error.message);
    return mapSession(data);
  }

  async upsertResult(result: AssessmentResult) {
    const { data, error } = await this.supabase
      .from("assessment_results")
      .upsert(
        {
          session_id: result.sessionId,
          bmi: result.bmi,
          bmi_category: result.bmiCategory,
          bmr: result.bmr,
          tdee: result.tdee,
          recommended_calories: result.recommendedCalories,
          target_date: result.targetDate,
          estimated_weeks: result.estimatedWeeks,
          estimated_weeks_range: result.estimatedWeeksRange,
          summary: result.summary,
          projection_curve: result.projectionCurve,
          recommendations: result.recommendations,
          created_at: result.createdAt,
          updated_at: result.updatedAt
        },
        { onConflict: "session_id" }
      )
      .select()
      .single<ResultRow>();

    if (error) throw new Error(error.message);
    return mapResult(data);
  }

  async getResult(sessionId: string) {
    const { data, error } = await this.supabase
      .from("assessment_results")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle<ResultRow>();

    if (error) throw new Error(error.message);
    return data ? mapResult(data) : null;
  }

  async activateSubscription(input: {
    sessionId: string;
    providerEventId: string;
    amountCents: number;
    currency: string;
    rawPayload: unknown;
  }) {
    const session = await this.getSession(input.sessionId);
    if (!session) throw notFound("Session not found");

    const timestamp = now();
    const { data: paymentData, error: paymentError } = await this.supabase
      .from("payments")
      .upsert(
        {
          session_id: input.sessionId,
          provider: "mock",
          provider_event_id: input.providerEventId,
          provider_order_id: null,
          provider_capture_id: null,
          status: "succeeded",
          amount_cents: input.amountCents,
          currency: input.currency.toUpperCase(),
          raw_payload: input.rawPayload,
          paid_at: timestamp,
          created_at: timestamp
        },
        { onConflict: "provider_event_id" }
      )
      .select()
      .single<PaymentRow>();

    if (paymentError) throw new Error(paymentError.message);

    const { data: sessionData, error: sessionError } = await this.supabase
      .from("assessment_sessions")
      .update({
        subscription_status: "active",
        updated_at: timestamp
      })
      .eq("id", input.sessionId)
      .select()
      .single<SessionRow>();

    if (sessionError) throw new Error(sessionError.message);
    return { session: mapSession(sessionData), payment: mapPayment(paymentData) };
  }
}

let repository: AppRepository | null = null;

export function getRepository(): AppRepository {
  if (repository) return repository;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  repository =
    url && serviceRoleKey
      ? new SupabaseRepository(createClient(url, serviceRoleKey, { auth: { persistSession: false } }))
      : new FileRepository();

  return repository;
}
