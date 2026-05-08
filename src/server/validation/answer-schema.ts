import { z } from "zod";
import { getDefaultFunnel, getStepByQuestionKey } from "@/src/server/domain/funnel";
import { validationError } from "@/src/server/domain/errors";
import type { AssessmentAnswer, AnswerValue } from "@/src/server/domain/types";

export const answerInputSchema = z.object({
  questionKey: z.string().min(1),
  questionId: z.string().min(1),
  stepIndex: z.number().int().min(0),
  answerType: z.enum(["single_select", "multi_select", "input"]),
  value: z.union([z.string(), z.array(z.string()), z.number(), z.null()])
});

export const saveAnswersSchema = z.object({
  currentStepIndex: z.number().int().min(0),
  answers: z.array(answerInputSchema).min(1)
});

export type AnswerInput = z.infer<typeof answerInputSchema>;
export type SaveAnswersInput = z.infer<typeof saveAnswersSchema>;

const numericBoundaries: Record<string, { min: number; max: number; label: string }> = {
  age: { min: 18, max: 80, label: "age" },
  heightCm: { min: 120, max: 230, label: "heightCm" },
  currentWeightKg: { min: 35, max: 250, label: "currentWeightKg" },
  targetWeightKg: { min: 35, max: 250, label: "targetWeightKg" }
};

export function validateAnswerAgainstFunnel(answer: AnswerInput) {
  const step = getStepByQuestionKey(answer.questionKey);

  if (!step || step.type !== "question" || !step.questionType) {
    throw validationError(`Unknown questionKey: ${answer.questionKey}`);
  }

  if (step.questionType !== answer.answerType) {
    throw validationError(`${answer.questionKey} expects ${step.questionType}`);
  }

  if (answer.answerType === "input") {
    if (typeof answer.value !== "number" || Number.isNaN(answer.value)) {
      throw validationError(`${answer.questionKey} must be a number`);
    }

    const bounds = numericBoundaries[answer.questionKey];
    if (bounds && (answer.value < bounds.min || answer.value > bounds.max)) {
      throw validationError(`${bounds.label} must be between ${bounds.min} and ${bounds.max}`);
    }

    return;
  }

  const allowedValues = new Set(step.options.map((option) => option.value));

  if (answer.answerType === "single_select") {
    if (typeof answer.value !== "string" || !allowedValues.has(answer.value)) {
      throw validationError(`${answer.questionKey} contains an unsupported option`);
    }
  }

  if (answer.answerType === "multi_select") {
    if (!Array.isArray(answer.value) || answer.value.length === 0) {
      throw validationError(`${answer.questionKey} requires at least one option`);
    }

    const invalid = answer.value.filter((value) => !allowedValues.has(value));
    if (invalid.length > 0) {
      throw validationError(`${answer.questionKey} contains unsupported options`, invalid);
    }
  }
}

export function toAnswerMap(answers: AssessmentAnswer[]) {
  return answers.reduce<Record<string, AnswerValue>>((acc, answer) => {
    acc[answer.questionKey] = answer.value;
    return acc;
  }, {});
}

export function validateStepIndex(currentStepIndex: number) {
  const maxStepIndex = getDefaultFunnel().steps.length - 1;

  if (currentStepIndex < 0 || currentStepIndex > maxStepIndex) {
    throw validationError(`currentStepIndex must be between 0 and ${maxStepIndex}`);
  }
}
