import type { AnswerValue, AssessmentResult } from "./types";

type CalculatorInput = Record<string, AnswerValue>;

const activityFactors: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9
};

function asNumber(value: AnswerValue, key: string) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function asString(value: AnswerValue, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function round(value: number, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function bmiCategory(bmi: number): AssessmentResult["bmiCategory"] {
  if (bmi < 18.5) return "underweight";
  if (bmi < 25) return "normal";
  if (bmi < 30) return "overweight";
  return "obese";
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function bmrFor(gender: string, weightKg: number, heightCm: number, age: number) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  if (gender === "female") return base - 161;
  if (gender === "male") return base + 5;
  return ((base - 161) + (base + 5)) / 2;
}

function calorieFloor(gender: string) {
  if (gender === "female") return 1200;
  if (gender === "male") return 1500;
  return 1350;
}

function calorieAdjustment(goal: string, deltaKg: number) {
  if (goal === "gain_muscle" || deltaKg < 0) return 250;
  if (goal === "lose_weight" || deltaKg > 0) return -450;
  return -250;
}

function recommendationsFor(input: {
  goal: string;
  bmi: number;
  activityFrequency: string;
  estimatedWeeks: number;
}) {
  const recommendations = [
    "Keep the first two weeks deliberately easy so the habit survives normal workdays.",
    "Pair three short Pilates sessions with two low-pressure walks each week.",
    "Use protein and fiber as anchors at each meal before changing portion sizes aggressively."
  ];

  if (input.goal === "gain_muscle") {
    recommendations.push("Add a small calorie surplus and track strength progress, not just body weight.");
  }

  if (input.bmi >= 30) {
    recommendations.push("Favor joint-friendly movement and gradual weekly progress over high-impact volume.");
  }

  if (input.activityFrequency === "sedentary") {
    recommendations.push("Start with ten-minute movement blocks; consistency matters more than workout length.");
  }

  if (input.estimatedWeeks > 16) {
    recommendations.push("Review progress monthly and adjust calories only after two stable weigh-in weeks.");
  }

  return recommendations;
}

export function calculateAssessmentResult(
  sessionId: string,
  answers: CalculatorInput,
  referenceDate = new Date()
): AssessmentResult {
  const gender = asString(answers.gender, "other");
  const goal = asString(answers.goal, "lose_weight");
  const activityFrequency = asString(answers.activityFrequency, "light");
  const age = asNumber(answers.age, "age");
  const heightCm = asNumber(answers.heightCm, "heightCm");
  const currentWeightKg = asNumber(answers.currentWeightKg, "currentWeightKg");
  const targetWeightKg = asNumber(answers.targetWeightKg, "targetWeightKg");

  const heightM = heightCm / 100;
  const bmi = round(currentWeightKg / (heightM * heightM), 1);
  const bmr = round(bmrFor(gender, currentWeightKg, heightCm, age));
  const tdee = round(bmr * (activityFactors[activityFrequency] ?? activityFactors.light));
  const deltaKg = currentWeightKg - targetWeightKg;
  const adjustment = calorieAdjustment(goal, deltaKg);
  const recommendedCalories = Math.round(
    Math.max(calorieFloor(gender), tdee + adjustment)
  );

  const absoluteDelta = Math.abs(deltaKg);
  const weeklyChange =
    absoluteDelta === 0
      ? 0.25
      : deltaKg >= 0
        ? clamp(absoluteDelta * 0.08, 0.25, 0.75)
        : clamp(absoluteDelta * 0.06, 0.15, 0.5);
  const estimatedWeeks = Math.max(4, Math.ceil(absoluteDelta / weeklyChange));
  const targetDate = toDateOnly(addDays(referenceDate, estimatedWeeks * 7));
  const targetBmi = targetWeightKg / (heightM * heightM);
  const riskFlags = targetBmi < 18.5 ? ["target_bmi_below_healthy_range"] : [];

  const projectionCurve = Array.from({ length: Math.min(estimatedWeeks, 24) }, (_, index) => {
    const week = index + 1;
    const direction = deltaKg >= 0 ? -1 : 1;
    const projected = currentWeightKg + direction * Math.min(absoluteDelta, weeklyChange * week);

    return {
      week,
      weightKg: round(projected, 1)
    };
  });

  const category = bmiCategory(bmi);
  const timestamp = new Date().toISOString();

  return {
    sessionId,
    bmi,
    bmiCategory: category,
    bmr,
    tdee,
    recommendedCalories,
    targetDate,
    estimatedWeeks,
    estimatedWeeksRange: `${Math.max(4, estimatedWeeks - 2)}-${estimatedWeeks + 2}`,
    summary: {
      headline: category === "normal" ? "Your baseline is solid." : "Your plan has a clear starting point.",
      body:
        goal === "gain_muscle"
          ? "We will build around steady strength gains, recovery, and a modest calorie surplus."
          : "We will use a moderate calorie target and low-impact Pilates rhythm to keep progress realistic.",
      riskFlags
    },
    projectionCurve,
    recommendations: recommendationsFor({ goal, bmi, activityFrequency, estimatedWeeks }),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
