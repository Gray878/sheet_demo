import { describe, expect, it } from "vitest";
import { calculateAssessmentResult } from "@/src/server/domain/result-calculator";

describe("calculateAssessmentResult", () => {
  it("calculates BMI, calorie target, and projection for weight loss", () => {
    const result = calculateAssessmentResult(
      "session_1",
      {
        gender: "female",
        goal: "lose_weight",
        age: 32,
        heightCm: 165,
        currentWeightKg: 72,
        targetWeightKg: 62,
        activityFrequency: "light"
      },
      new Date("2026-05-08T00:00:00.000Z")
    );

    expect(result.bmi).toBe(26.4);
    expect(result.bmiCategory).toBe("overweight");
    expect(result.recommendedCalories).toBeGreaterThanOrEqual(1200);
    expect(result.targetDate).toBe("2026-08-14");
    expect(result.projectionCurve[0]).toEqual({ week: 1, weightKg: 71.3 });
  });

  it("returns a risk flag when target BMI is below healthy range", () => {
    const result = calculateAssessmentResult(
      "session_2",
      {
        gender: "male",
        goal: "lose_weight",
        age: 40,
        heightCm: 180,
        currentWeightKg: 82,
        targetWeightKg: 58,
        activityFrequency: "moderate"
      },
      new Date("2026-05-08T00:00:00.000Z")
    );

    expect(result.summary.riskFlags).toContain("target_bmi_below_healthy_range");
  });
});
