import scrapedData from "@/scrape/betterme_scrape/betterme_public_data.json";
import type { AnswerType, Funnel, FunnelOption, FunnelStep } from "./types";

type ScrapedStep = {
  index: number;
  id: number;
  type: "INFO_PAGE" | "QUESTION" | "LOADER";
  title?: string | null;
  description?: string | null;
  questionId?: number;
  questionType?: AnswerType;
  contentKey?: string | null;
  customizationKey?: string | null;
  answers?: Array<{
    id: number;
    title?: string | null;
    description?: string | null;
    order?: number;
  }>;
};

const selectedScrapedIndexes = new Set([0, 1, 2, 7, 8, 14, 17, 20, 24, 25, 27, 28, 29, 30, 32]);

const coreQuestionKeys = new Set([
  "gender",
  "goal",
  "age",
  "heightCm",
  "currentWeightKg",
  "targetWeightKg",
  "activityFrequency"
]);

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function questionKeyFor(step: ScrapedStep) {
  if (step.contentKey === "goalType" || step.customizationKey === "goal") return "goal";
  if (step.contentKey === "fitnessLevel" || step.customizationKey === "fitness_level") {
    return "activityFrequency";
  }
  if (step.contentKey === "bodyZones") return "targetZones";
  if (step.contentKey === "dietId") return "dietPreference";
  if (step.customizationKey === "level") return "fitnessLevel";
  if (step.customizationKey === "lifestyle") return "lifestyle";
  if (step.customizationKey === "sleep_hours") return "sleepQuality";
  if (step.customizationKey === "upcoming_event") return "upcomingEvent";
  if (step.title?.toLowerCase().includes("bad habits")) return "badHabits";
  if (step.contentKey) return step.contentKey;
  if (step.customizationKey) return step.customizationKey;
  return slugify(step.title ?? `question_${step.id}`);
}

function optionValue(questionKey: string, label: string) {
  const lower = label.toLowerCase();

  if (questionKey === "goal") {
    if (lower.includes("lose")) return "lose_weight";
    if (lower.includes("muscle")) return "gain_muscle";
    if (lower.includes("flexibility")) return "improve_flexibility";
    if (lower.includes("stress")) return "reduce_stress";
    if (lower.includes("posture")) return "improve_posture";
  }

  if (questionKey === "activityFrequency") {
    if (lower.includes("almost every")) return "active";
    if (lower.includes("several times per week")) return "moderate";
    if (lower.includes("several times per month")) return "light";
    if (lower.includes("never")) return "sedentary";
  }

  return slugify(label);
}

function optionsFor(step: ScrapedStep, questionKey: string): FunnelOption[] {
  return (step.answers ?? []).map((answer, index) => {
    const label = answer.title ?? `Option ${index + 1}`;

    return {
      id: String(answer.id),
      value: optionValue(questionKey, label),
      label,
      description: answer.description ?? null,
      sortOrder: answer.order ?? index
    };
  });
}

function inputFor(questionKey: string): FunnelStep["input"] {
  switch (questionKey) {
    case "heightCm":
      return { unit: "cm", min: 120, max: 230, placeholder: "165" };
    case "currentWeightKg":
    case "targetWeightKg":
      return { unit: "kg", min: 35, max: 250, placeholder: "72" };
    case "age":
      return { unit: "years", min: 18, max: 80, placeholder: "32" };
    default:
      return undefined;
  }
}

function mapScrapedStep(step: ScrapedStep, stepIndex: number): FunnelStep {
  if (step.type !== "QUESTION") {
    return {
      id: `step_${step.id}`,
      sourceId: String(step.id),
      stepIndex,
      type: step.type === "LOADER" ? "loader" : "info",
      title: step.title ?? "Your plan is taking shape",
      description: step.description ?? null,
      required: false,
      options: []
    };
  }

  const questionKey = questionKeyFor(step);
  const questionType = step.questionType ?? "single_select";

  return {
    id: `question_${step.id}`,
    sourceId: String(step.id),
    stepIndex,
    type: "question",
    title: step.title ?? "Tell us a little more",
    description: step.description ?? null,
    questionKey,
    questionType,
    required: coreQuestionKeys.has(questionKey),
    options: optionsFor(step, questionKey),
    input: questionType === "input" ? inputFor(questionKey) : undefined
  };
}

const genderStep: FunnelStep = {
  id: "question_gender",
  stepIndex: 1,
  type: "question",
  title: "Which option best describes you?",
  description: "This helps calibrate calorie guidance without creating an account.",
  questionKey: "gender",
  questionType: "single_select",
  required: true,
  options: [
    { id: "gender_female", value: "female", label: "Female", sortOrder: 0 },
    { id: "gender_male", value: "male", label: "Male", sortOrder: 1 },
    { id: "gender_other", value: "other", label: "Another option", sortOrder: 2 }
  ]
};

export function getDefaultFunnel(): Funnel {
  const scrapedSteps = (scrapedData.quiz.steps as ScrapedStep[])
    .filter((step) => selectedScrapedIndexes.has(step.index))
    .map((step, index) => mapScrapedStep(step, index >= 1 ? index + 1 : index));

  const steps = [scrapedSteps[0], genderStep, ...scrapedSteps.slice(1)].map((step, index) => ({
    ...step,
    stepIndex: index
  }));

  return {
    id: "default",
    slug: "default",
    title: "Bendwell Health Plan",
    version: 1,
    steps
  };
}

export function getStepByQuestionKey(questionKey: string) {
  return getDefaultFunnel().steps.find((step) => step.questionKey === questionKey);
}

export function getCoreQuestionKeys() {
  return [...coreQuestionKeys];
}
