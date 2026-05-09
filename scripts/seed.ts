import "dotenv/config";
import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { funnelAssetUrl } from "../src/lib/funnel-assets";
import { closeDb, getDb } from "../src/server/db/client";
import { answerOptions, funnelSteps, funnels } from "../src/server/db/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

type ScrapedStep = {
  id: string | number;
  type: string;
  title?: string;
  description?: string | null;
  contentKey?: string;
  customizationKey?: string;
  questionType?: "single_select" | "multi_select" | "input";
  questionKey?: string;
  imageUrl?: string | null;
  questionImageUrl?: string | null;
  answers?: Array<{
    id: string | number;
    title?: string;
    value?: string;
    description?: string | null;
    iconUrl?: string | null;
    order?: number;
  }>;
  mappedIndex: number;
};

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

function inputConfig(questionKey: string) {
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

async function main() {
  const raw = JSON.parse(await readFile("scrape/betterme_scrape/betterme_public_data.json", "utf8"));
  const db = getDb();
  const scrapedSteps = (raw.quiz.steps as ScrapedStep[]).map((step, index) => ({
    ...step,
    mappedIndex: index >= 1 ? index + 1 : index
  }));
  const steps = [
    scrapedSteps[0],
    {
      id: "gender",
      type: "QUESTION",
      title: "Which option best describes you?",
      description: "This helps calibrate calorie guidance without creating an account.",
      questionType: "single_select",
      questionKey: "gender",
      imageUrl: null,
      questionImageUrl: null,
      answers: [
        { id: "gender_female", title: "Female", value: "female", iconUrl: null, order: 0 },
        { id: "gender_male", title: "Male", value: "male", iconUrl: null, order: 1 },
        { id: "gender_other", title: "Another option", value: "other", iconUrl: null, order: 2 }
      ],
      mappedIndex: 1
    } satisfies ScrapedStep,
    ...scrapedSteps.slice(1)
  ].map((step, index) => ({ ...step, mappedIndex: index }));
  const timestamp = new Date().toISOString();

  await db
    .insert(funnels)
    .values({
      id: "default",
      slug: "default",
      title: "Bendwell Health Plan",
      version: 1,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp
    })
    .onConflictDoUpdate({
      target: funnels.id,
      set: {
        slug: "default",
        title: "Bendwell Health Plan",
        version: 1,
        isActive: true,
        updatedAt: timestamp
      }
    });

  for (const step of steps) {
    const isQuestion = step.type === "QUESTION";
    const questionKey = isQuestion ? step.questionKey ?? questionKeyFor(step) : null;
    const stepId = isQuestion ? `question_${step.id}` : `step_${step.id}`;

    await db
      .insert(funnelSteps)
      .values({
        id: stepId,
        flowId: "default",
        sourceId: String(step.id),
        stepIndex: step.mappedIndex,
        type: isQuestion ? "question" : step.type === "LOADER" ? "loader" : "info",
        questionKey,
        questionType: isQuestion ? step.questionType ?? null : null,
        title: step.title ?? "Your plan is taking shape",
        description: step.description ?? null,
        imageUrl: funnelAssetUrl(step.imageUrl),
        questionImageUrl: funnelAssetUrl(step.questionImageUrl),
        required: questionKey ? coreQuestionKeys.has(questionKey) : false,
        inputConfig: questionKey ? inputConfig(questionKey) : {},
        createdAt: timestamp,
        updatedAt: timestamp
      })
      .onConflictDoUpdate({
        target: funnelSteps.id,
        set: {
          sourceId: String(step.id),
          stepIndex: step.mappedIndex,
          type: isQuestion ? "question" : step.type === "LOADER" ? "loader" : "info",
          questionKey,
          questionType: isQuestion ? step.questionType ?? null : null,
          title: step.title ?? "Your plan is taking shape",
          description: step.description ?? null,
          imageUrl: funnelAssetUrl(step.imageUrl),
          questionImageUrl: funnelAssetUrl(step.questionImageUrl),
          required: questionKey ? coreQuestionKeys.has(questionKey) : false,
          inputConfig: questionKey ? inputConfig(questionKey) : {},
          updatedAt: timestamp
        }
      });

    if (isQuestion) {
      for (const [optionIndex, answer] of (step.answers ?? []).entries()) {
        const label = answer.title ?? `Option ${optionIndex + 1}`;
        await db
          .insert(answerOptions)
          .values({
            id: `${stepId}_${answer.id}`,
            stepId,
            value: answer.value ?? optionValue(questionKey ?? stepId, label),
            label,
            description: answer.description ?? null,
            iconUrl: funnelAssetUrl(answer.iconUrl),
            sortOrder: answer.order ?? optionIndex,
            createdAt: timestamp
          })
          .onConflictDoUpdate({
            target: answerOptions.id,
            set: {
              value: sql`excluded.value`,
              label: sql`excluded.label`,
              description: sql`excluded.description`,
              iconUrl: sql`excluded.icon_url`,
              sortOrder: sql`excluded.sort_order`
            }
          });
      }
    }
  }

  console.log(`Seeded ${steps.length} funnel steps.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
