import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const selectedIndexes = new Set([0, 1, 2, 7, 8, 14, 17, 20, 24, 25, 27, 28, 29, 30, 32]);
const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
const raw = JSON.parse(await readFile("scrape/betterme_scrape/betterme_public_data.json", "utf8"));

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function questionKeyFor(step) {
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

function optionValue(questionKey, label) {
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

function inputConfig(questionKey) {
  if (questionKey === "heightCm") return { unit: "cm", min: 120, max: 230, placeholder: "165" };
  if (questionKey === "currentWeightKg" || questionKey === "targetWeightKg") {
    return { unit: "kg", min: 35, max: 250, placeholder: "72" };
  }
  if (questionKey === "age") return { unit: "years", min: 18, max: 80, placeholder: "32" };
  return {};
}

const coreQuestionKeys = new Set([
  "gender",
  "goal",
  "age",
  "heightCm",
  "currentWeightKg",
  "targetWeightKg",
  "activityFrequency"
]);

const scrapedSteps = raw.quiz.steps
  .filter((step) => selectedIndexes.has(step.index))
  .map((step, index) => ({ ...step, mappedIndex: index >= 1 ? index + 1 : index }));

const steps = [
  scrapedSteps[0],
  {
    id: "gender",
    type: "QUESTION",
    title: "Which option best describes you?",
    description: "This helps calibrate calorie guidance without creating an account.",
    questionType: "single_select",
    questionKey: "gender",
    answers: [
      { id: "gender_female", title: "Female", value: "female", order: 0 },
      { id: "gender_male", title: "Male", value: "male", order: 1 },
      { id: "gender_other", title: "Another option", value: "other", order: 2 }
    ],
    mappedIndex: 1
  },
  ...scrapedSteps.slice(1)
].map((step, index) => ({ ...step, mappedIndex: index }));

await supabase.from("funnels").upsert({
  id: "default",
  slug: "default",
  title: "Bendwell Health Plan",
  version: 1,
  is_active: true
});

for (const step of steps) {
  const isQuestion = step.type === "QUESTION";
  const questionKey = isQuestion ? step.questionKey ?? questionKeyFor(step) : null;
  const stepId = isQuestion ? `question_${step.id}` : `step_${step.id}`;

  const { error } = await supabase.from("funnel_steps").upsert(
    {
      id: stepId,
      flow_id: "default",
      source_id: String(step.id),
      step_index: step.mappedIndex,
      type: isQuestion ? "question" : step.type === "LOADER" ? "loader" : "info",
      question_key: questionKey,
      question_type: isQuestion ? step.questionType : null,
      title: step.title ?? "Your plan is taking shape",
      description: step.description ?? null,
      required: questionKey ? coreQuestionKeys.has(questionKey) : false,
      input_config: questionKey ? inputConfig(questionKey) : {}
    },
    { onConflict: "id" }
  );

  if (error) throw new Error(error.message);

  if (isQuestion) {
    for (const [optionIndex, answer] of (step.answers ?? []).entries()) {
      const label = answer.title ?? `Option ${optionIndex + 1}`;
      const { error: optionError } = await supabase.from("answer_options").upsert(
        {
          id: `${stepId}_${answer.id}`,
          step_id: stepId,
          value: answer.value ?? optionValue(questionKey, label),
          label,
          description: answer.description ?? null,
          sort_order: answer.order ?? optionIndex
        },
        { onConflict: "id" }
      );

      if (optionError) throw new Error(optionError.message);
    }
  }
}

console.log(`Seeded ${steps.length} funnel steps.`);
