import { cookies } from "next/headers";
import { getCoreQuestionKeys, getDefaultFunnel } from "@/src/server/domain/funnel";
import { notFound, unprocessable } from "@/src/server/domain/errors";
import { calculateAssessmentResult } from "@/src/server/domain/result-calculator";
import { getRepository } from "@/src/server/repositories/app-repository";
import {
  toAnswerMap,
  validateAnswerAgainstFunnel,
  validateStepIndex,
  type SaveAnswersInput
} from "@/src/server/validation/answer-schema";

export async function createSession() {
  const session = await getRepository().createSession();
  const cookieStore = await cookies();

  cookieStore.set("health_funnel_session", session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });

  return session;
}

export async function getSessionWithProgress(sessionId: string) {
  const repository = getRepository();
  const session = await repository.getSession(sessionId);
  if (!session) throw notFound("Session not found");

  const answers = await repository.listAnswers(sessionId);
  return {
    session: { ...session, sessionId: session.id },
    answers,
    progress: {
      answeredCount: answers.length,
      totalSteps: getDefaultFunnel().steps.length,
      currentStepIndex: session.currentStepIndex
    }
  };
}

export async function saveAnswers(sessionId: string, input: SaveAnswersInput) {
  validateStepIndex(input.currentStepIndex);
  input.answers.forEach(validateAnswerAgainstFunnel);

  const savedAnswers = await getRepository().upsertAnswers(
    sessionId,
    input.currentStepIndex,
    input.answers
  );

  const session = await getRepository().getSession(sessionId);
  if (!session) throw notFound("Session not found");

  return { session, answers: savedAnswers };
}

export async function submitAssessment(sessionId: string) {
  const repository = getRepository();
  const session = await repository.getSession(sessionId);
  if (!session) throw notFound("Session not found");

  const answers = await repository.listAnswers(sessionId);
  const answerMap = toAnswerMap(answers);
  const missing = getCoreQuestionKeys().filter((key) => answerMap[key] == null);

  if (missing.length > 0) {
    throw unprocessable("Assessment is missing required answers", missing);
  }

  const result = calculateAssessmentResult(sessionId, answerMap);
  await repository.upsertResult(result);
  const updatedSession = await repository.markResultReady(sessionId);

  return { session: updatedSession, result };
}
