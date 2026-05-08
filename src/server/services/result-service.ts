import { notFound } from "@/src/server/domain/errors";
import { getRepository } from "@/src/server/repositories/app-repository";

export async function getDifferentiatedResult(sessionId: string) {
  const repository = getRepository();
  const session = await repository.getSession(sessionId);
  if (!session) throw notFound("Session not found");

  const result = await repository.getResult(sessionId);
  if (!result) throw notFound("Assessment result not found");

  if (session.subscriptionStatus !== "active") {
    return {
      sessionId,
      subscriptionStatus: session.subscriptionStatus,
      result: {
        bmi: result.bmi,
        bmiCategory: result.bmiCategory,
        summary: result.summary,
        estimatedWeeksRange: result.estimatedWeeksRange
      },
      paywall: {
        required: true,
        reason: "subscription_required"
      }
    };
  }

  return {
    sessionId,
    subscriptionStatus: session.subscriptionStatus,
    result: {
      bmi: result.bmi,
      bmiCategory: result.bmiCategory,
      bmr: result.bmr,
      tdee: result.tdee,
      recommendedCalories: result.recommendedCalories,
      targetDate: result.targetDate,
      estimatedWeeks: result.estimatedWeeks,
      projectionCurve: result.projectionCurve,
      summary: result.summary,
      recommendations: result.recommendations
    },
    paywall: {
      required: false
    }
  };
}
