import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { asc, eq, sql } from "drizzle-orm";
import { getDb, hasDatabaseUrl, type Database } from "@/src/server/db/client";
import {
  assessmentAnswers,
  assessmentResults,
  assessmentSessions,
  payments
} from "@/src/server/db/schema";
import { notFound } from "@/src/server/domain/errors";
import type {
  AssessmentAnswer,
  AssessmentResult,
  AssessmentSession,
  Payment
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
    provider?: Payment["provider"];
    providerEventId: string;
    providerOrderId?: string | null;
    providerCaptureId?: string | null;
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
    provider?: Payment["provider"];
    providerEventId: string;
    providerOrderId?: string | null;
    providerCaptureId?: string | null;
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
        provider: input.provider ?? "mock",
        providerEventId: input.providerEventId,
        providerOrderId: input.providerOrderId ?? null,
        providerCaptureId: input.providerCaptureId ?? null,
        status: "succeeded",
        amountCents: input.amountCents,
        currency: input.currency.toUpperCase(),
        rawPayload: input.rawPayload,
        paidAt: timestamp,
        createdAt: timestamp
      };
      db.payments.push(payment);
    } else {
      payment.provider = input.provider ?? "mock";
      payment.providerOrderId = input.providerOrderId ?? null;
      payment.providerCaptureId = input.providerCaptureId ?? null;
      payment.status = "succeeded";
      payment.amountCents = input.amountCents;
      payment.currency = input.currency.toUpperCase();
      payment.rawPayload = input.rawPayload;
      payment.paidAt = timestamp;
    }

    session.subscriptionStatus = "active";
    session.updatedAt = timestamp;
    await writeDevDb(db);
    return { session, payment };
  }
}

type SessionRow = typeof assessmentSessions.$inferSelect;
type AnswerRow = typeof assessmentAnswers.$inferSelect;
type ResultRow = typeof assessmentResults.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;

function mapSession(row: SessionRow): AssessmentSession {
  return {
    id: row.id,
    anonymousId: row.anonymousId,
    flowId: row.flowId,
    status: row.status,
    currentStepIndex: row.currentStepIndex,
    subscriptionStatus: row.subscriptionStatus,
    submittedAt: row.submittedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapAnswer(row: AnswerRow): AssessmentAnswer {
  return {
    id: row.id,
    sessionId: row.sessionId,
    questionKey: row.questionKey,
    questionId: row.questionId,
    stepIndex: row.stepIndex,
    answerType: row.answerType,
    value: row.value,
    answeredAt: row.answeredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapResult(row: ResultRow): AssessmentResult {
  return {
    sessionId: row.sessionId,
    bmi: Number(row.bmi),
    bmiCategory: row.bmiCategory,
    bmr: Number(row.bmr),
    tdee: Number(row.tdee),
    recommendedCalories: row.recommendedCalories,
    targetDate: row.targetDate,
    estimatedWeeks: row.estimatedWeeks,
    estimatedWeeksRange: row.estimatedWeeksRange,
    summary: row.summary,
    projectionCurve: row.projectionCurve,
    recommendations: row.recommendations,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    sessionId: row.sessionId,
    provider: row.provider,
    providerEventId: row.providerEventId,
    providerOrderId: row.providerOrderId,
    providerCaptureId: row.providerCaptureId,
    status: row.status,
    amountCents: row.amountCents,
    currency: row.currency,
    rawPayload: row.rawPayload,
    paidAt: row.paidAt,
    createdAt: row.createdAt
  };
}

class DrizzleRepository implements AppRepository {
  constructor(private readonly db: Database) {}

  async createSession() {
    const timestamp = now();
    const [row] = await this.db
      .insert(assessmentSessions)
      .values({
        id: crypto.randomUUID(),
        anonymousId: crypto.randomUUID(),
        flowId: "default",
        status: "in_progress",
        currentStepIndex: 0,
        subscriptionStatus: "inactive",
        submittedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp
      })
      .returning();

    return mapSession(row);
  }

  async getSession(sessionId: string) {
    const [row] = await this.db
      .select()
      .from(assessmentSessions)
      .where(eq(assessmentSessions.id, sessionId))
      .limit(1);

    return row ? mapSession(row) : null;
  }

  async listAnswers(sessionId: string) {
    const rows = await this.db
      .select()
      .from(assessmentAnswers)
      .where(eq(assessmentAnswers.sessionId, sessionId))
      .orderBy(asc(assessmentAnswers.stepIndex));

    return rows.map(mapAnswer);
  }

  async upsertAnswers(sessionId: string, currentStepIndex: number, answers: AnswerInput[]) {
    const session = await this.getSession(sessionId);
    if (!session) throw notFound("Session not found");

    const timestamp = now();
    const rows = answers.map((answer) => ({
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
    }));

    const saved = await this.db.transaction(async (tx) => {
      const savedAnswers =
        rows.length > 0
          ? await tx
              .insert(assessmentAnswers)
              .values(rows)
              .onConflictDoUpdate({
                target: [assessmentAnswers.sessionId, assessmentAnswers.questionKey],
                set: {
                  questionId: sql`excluded.question_id`,
                  stepIndex: sql`excluded.step_index`,
                  answerType: sql`excluded.answer_type`,
                  value: sql`excluded.value`,
                  answeredAt: timestamp,
                  updatedAt: timestamp
                }
              })
              .returning()
          : [];

      await tx
        .update(assessmentSessions)
        .set({
          currentStepIndex: Math.max(session.currentStepIndex, currentStepIndex),
          updatedAt: timestamp
        })
        .where(eq(assessmentSessions.id, sessionId));

      return savedAnswers;
    });

    return saved.map(mapAnswer);
  }

  async markResultReady(sessionId: string) {
    const timestamp = now();
    const [row] = await this.db
      .update(assessmentSessions)
      .set({
        status: "result_ready",
        submittedAt: timestamp,
        updatedAt: timestamp
      })
      .where(eq(assessmentSessions.id, sessionId))
      .returning();

    if (!row) throw notFound("Session not found");
    return mapSession(row);
  }

  async upsertResult(result: AssessmentResult) {
    const [row] = await this.db
      .insert(assessmentResults)
      .values({
        sessionId: result.sessionId,
        bmi: result.bmi,
        bmiCategory: result.bmiCategory,
        bmr: result.bmr,
        tdee: result.tdee,
        recommendedCalories: result.recommendedCalories,
        targetDate: result.targetDate,
        estimatedWeeks: result.estimatedWeeks,
        estimatedWeeksRange: result.estimatedWeeksRange,
        summary: result.summary,
        projectionCurve: result.projectionCurve,
        recommendations: result.recommendations,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt
      })
      .onConflictDoUpdate({
        target: assessmentResults.sessionId,
        set: {
          bmi: result.bmi,
          bmiCategory: result.bmiCategory,
          bmr: result.bmr,
          tdee: result.tdee,
          recommendedCalories: result.recommendedCalories,
          targetDate: result.targetDate,
          estimatedWeeks: result.estimatedWeeks,
          estimatedWeeksRange: result.estimatedWeeksRange,
          summary: result.summary,
          projectionCurve: result.projectionCurve,
          recommendations: result.recommendations,
          updatedAt: result.updatedAt
        }
      })
      .returning();

    return mapResult(row);
  }

  async getResult(sessionId: string) {
    const [row] = await this.db
      .select()
      .from(assessmentResults)
      .where(eq(assessmentResults.sessionId, sessionId))
      .limit(1);

    return row ? mapResult(row) : null;
  }

  async activateSubscription(input: {
    sessionId: string;
    provider?: Payment["provider"];
    providerEventId: string;
    providerOrderId?: string | null;
    providerCaptureId?: string | null;
    amountCents: number;
    currency: string;
    rawPayload: unknown;
  }) {
    const session = await this.getSession(input.sessionId);
    if (!session) throw notFound("Session not found");

    const timestamp = now();
    return this.db.transaction(async (tx) => {
      const [payment] = await tx
        .insert(payments)
        .values({
          id: crypto.randomUUID(),
          sessionId: input.sessionId,
          provider: input.provider ?? "mock",
          providerEventId: input.providerEventId,
          providerOrderId: input.providerOrderId ?? null,
          providerCaptureId: input.providerCaptureId ?? null,
          status: "succeeded",
          amountCents: input.amountCents,
          currency: input.currency.toUpperCase(),
          rawPayload: input.rawPayload,
          paidAt: timestamp,
          createdAt: timestamp
        })
        .onConflictDoUpdate({
          target: payments.providerEventId,
          set: {
            provider: input.provider ?? "mock",
            status: "succeeded",
            providerOrderId: input.providerOrderId ?? null,
            providerCaptureId: input.providerCaptureId ?? null,
            amountCents: input.amountCents,
            currency: input.currency.toUpperCase(),
            rawPayload: input.rawPayload,
            paidAt: timestamp
          }
        })
        .returning();

      const [updatedSession] = await tx
        .update(assessmentSessions)
        .set({
          subscriptionStatus: "active",
          updatedAt: timestamp
        })
        .where(eq(assessmentSessions.id, input.sessionId))
        .returning();

      if (!updatedSession) throw notFound("Session not found");
      return { session: mapSession(updatedSession), payment: mapPayment(payment) };
    });
  }
}

let repository: AppRepository | null = null;

export function getRepository(): AppRepository {
  if (repository) return repository;

  repository = hasDatabaseUrl() ? new DrizzleRepository(getDb()) : new FileRepository();

  return repository;
}
