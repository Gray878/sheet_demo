export type SessionStatus = "in_progress" | "submitted" | "result_ready" | "expired";
export type SubscriptionStatus = "inactive" | "active" | "cancelled" | "refunded";
export type StepType = "info" | "question" | "loader";
export type AnswerType = "single_select" | "multi_select" | "input";

export type AnswerValue = string | string[] | number | null;

export interface FunnelOption {
  id: string;
  value: string;
  label: string;
  description?: string | null;
  iconUrl?: string | null;
  sortOrder: number;
}

export interface FunnelStep {
  id: string;
  sourceId?: string;
  stepIndex: number;
  type: StepType;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  questionImageUrl?: string | null;
  questionKey?: string;
  questionType?: AnswerType;
  required: boolean;
  options: FunnelOption[];
  input?: {
    unit?: string;
    min?: number;
    max?: number;
    placeholder?: string;
  };
}

export interface Funnel {
  id: string;
  slug: string;
  title: string;
  version: number;
  steps: FunnelStep[];
}

export interface AssessmentSession {
  id: string;
  anonymousId: string;
  flowId: string;
  status: SessionStatus;
  currentStepIndex: number;
  subscriptionStatus: SubscriptionStatus;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssessmentAnswer {
  id: string;
  sessionId: string;
  questionKey: string;
  questionId: string;
  stepIndex: number;
  answerType: AnswerType;
  value: AnswerValue;
  answeredAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectionPoint {
  week: number;
  weightKg: number;
}

export interface AssessmentResult {
  sessionId: string;
  bmi: number;
  bmiCategory: "underweight" | "normal" | "overweight" | "obese";
  bmr: number;
  tdee: number;
  recommendedCalories: number;
  targetDate: string;
  estimatedWeeks: number;
  estimatedWeeksRange: string;
  summary: {
    headline: string;
    body: string;
    riskFlags: string[];
  };
  projectionCurve: ProjectionPoint[];
  recommendations: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  sessionId: string;
  provider: "mock" | "paypal";
  providerEventId: string;
  providerOrderId: string | null;
  providerCaptureId: string | null;
  status: "created" | "succeeded" | "failed" | "refunded";
  amountCents: number;
  currency: string;
  rawPayload: unknown;
  paidAt: string;
  createdAt: string;
}
