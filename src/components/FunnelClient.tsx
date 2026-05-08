"use client";

import { ArrowLeft, ArrowRight, Check, ChevronRight, LoaderCircle, Menu, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { AnswerValue, Funnel, FunnelStep } from "@/src/server/domain/types";

type ApiEnvelope<T> = {
  data: T | null;
  error: { code: string; message: string; details?: unknown[] } | null;
};

type SessionProgress = {
  session: {
    id: string;
    currentStepIndex: number;
    subscriptionStatus: string;
  };
  answers: Array<{
    questionKey: string;
    questionId: string;
    stepIndex: number;
    answerType: "single_select" | "multi_select" | "input";
    value: AnswerValue;
  }>;
};

const sessionStorageKey = "health_funnel_session_id";

const ageCards = [
  {
    label: "Age: 18-29",
    imageUrl:
      "https://image-service.betterme.world/57355568-8766-44a5-a327-6266bc0080f7/image/upload/c_fill%2Cw_960/f_webp/q_auto:eco/fl_lossy/c_fit/r9r7heaa3tj2b59ao8gv"
  },
  {
    label: "Age: 30-39",
    imageUrl:
      "https://image-service.betterme.world/57355568-8766-44a5-a327-6266bc0080f7/image/upload/c_fill%2Cw_960/f_webp/q_auto:eco/fl_lossy/c_fit/ezhryf9gr4hypl4yuvek"
  },
  {
    label: "Age: 40-49",
    imageUrl:
      "https://image-service.betterme.world/57355568-8766-44a5-a327-6266bc0080f7/image/upload/c_fill%2Cw_960/f_webp/q_auto:eco/fl_lossy/c_fit/zametd6l35xiqgoyg7qp"
  },
  {
    label: "Age: 50+",
    imageUrl:
      "https://image-service.betterme.world/57355568-8766-44a5-a327-6266bc0080f7/image/upload/c_fill%2Cw_960/f_webp/q_auto:eco/fl_lossy/c_fit/kcrhcq05lujnbbjszq3w"
  }
];

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers
    }
  });
  const body = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || body.error) {
    throw new Error(body.error?.message ?? "Request failed");
  }

  return body.data as T;
}

function hasValue(step: FunnelStep, value: AnswerValue | undefined) {
  if (step.type !== "question") return true;
  if (step.questionType === "multi_select") return Array.isArray(value) && value.length > 0;
  if (step.questionType === "input") return typeof value === "number" && !Number.isNaN(value);
  return typeof value === "string" && value.length > 0;
}

function BetterMeHeader() {
  return (
    <header className="bm-header">
      <div className="bm-logo">BetterMe</div>
      <button className="bm-menu-button" aria-label="Open menu" type="button">
        <Menu size={24} strokeWidth={2} />
      </button>
    </header>
  );
}

export function FunnelClient() {
  const router = useRouter();
  const [isPending, startTransitionLocal] = useTransition();
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const loadedFunnel = await api<Funnel>("/api/funnels/default");
        const storedSessionId = window.localStorage.getItem(sessionStorageKey);
        let progress: SessionProgress | null = null;

        if (storedSessionId) {
          try {
            progress = await api<SessionProgress>(`/api/sessions/${storedSessionId}`);
          } catch {
            window.localStorage.removeItem(sessionStorageKey);
          }
        }

        if (!progress) {
          const created = await api<SessionProgress["session"]>("/api/sessions", { method: "POST" });
          window.localStorage.setItem(sessionStorageKey, created.id);
          progress = {
            session: created,
            answers: []
          };
        }

        if (cancelled) return;

        setFunnel(loadedFunnel);
        setSessionId(progress.session.id);
        setStepIndex(Math.min(progress.session.currentStepIndex, loadedFunnel.steps.length - 1));
        setAnswers(
          progress.answers.reduce<Record<string, AnswerValue>>((acc, answer) => {
            acc[answer.questionKey] = answer.value;
            return acc;
          }, {})
        );
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load the assessment");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const step = funnel?.steps[stepIndex] ?? null;
  const progress = funnel ? Math.round(((stepIndex + 1) / funnel.steps.length) * 100) : 0;
  const selectedValue = step?.questionKey ? answers[step.questionKey] : undefined;
  const canContinue = step ? hasValue(step, selectedValue) : false;

  const nextLabel = useMemo(() => {
    if (!funnel) return "Continue";
    return stepIndex === funnel.steps.length - 1 ? "Generate my plan" : "Continue";
  }, [funnel, stepIndex]);

  function setAnswer(step: FunnelStep, value: AnswerValue) {
    if (!step.questionKey) return;
    setError(null);
    setAnswers((current) => ({ ...current, [step.questionKey as string]: value }));
  }

  async function persistCurrentStep(targetIndex: number) {
    if (!step || step.type !== "question" || !step.questionKey || !sessionId) return;

    await api(`/api/sessions/${sessionId}/answers`, {
      method: "PATCH",
      body: JSON.stringify({
        currentStepIndex: targetIndex,
        answers: [
          {
            questionKey: step.questionKey,
            questionId: step.id,
            stepIndex: step.stepIndex,
            answerType: step.questionType,
            value: answers[step.questionKey]
          }
        ]
      })
    });
  }

  async function handleNext() {
    if (!funnel || !step || !sessionId) return;
    if (!canContinue) {
      setError("Choose an answer to keep going.");
      return;
    }

    try {
      setError(null);
      const isLastStep = stepIndex === funnel.steps.length - 1;
      const targetIndex = Math.min(stepIndex + 1, funnel.steps.length - 1);
      await persistCurrentStep(targetIndex);

      if (isLastStep) {
        await api(`/api/sessions/${sessionId}/submit`, { method: "POST" });
        startTransitionLocal(() => router.push(`/result/${sessionId}`));
        return;
      }

      setStepIndex(targetIndex);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save this step");
    }
  }

  function handleBack() {
    setError(null);
    setStepIndex((current) => Math.max(0, current - 1));
  }

  function resetDemo() {
    window.localStorage.removeItem(sessionStorageKey);
    window.location.reload();
  }

  function chooseAgeRange(label: string) {
    window.localStorage.setItem("health_funnel_age_range", label);
    setError(null);
    setStepIndex(1);
  }

  if (loading) {
    return (
      <main className="bm-loading">
        <LoaderCircle className="spin" aria-hidden="true" />
        <p>Preparing your assessment...</p>
      </main>
    );
  }

  if (!funnel || !step) {
    return (
      <main className="bm-loading">
        <p>{error ?? "Unable to load the assessment."}</p>
        <button className="bm-secondary-button" onClick={resetDemo} type="button">
          <RefreshCw size={18} />
          Restart
        </button>
      </main>
    );
  }

  if (stepIndex === 0) {
    return (
      <main className="bm-landing">
        <BetterMeHeader />
        <section className="bm-first-page" aria-labelledby="landing-title">
          <h1 id="landing-title">PILATES FOR BEGINNERS</h1>
          <p className="bm-subtitle">SELECT YOUR AGE TO START</p>
          <p className="bm-quiz-note">1-MINUTE QUIZ</p>

          <div className="bm-age-grid">
            {ageCards.map((card) => (
              <button className="bm-age-card" key={card.label} onClick={() => chooseAgeRange(card.label)} type="button">
                <span className="bm-age-image-wrap">
                  <img alt="" src={card.imageUrl} />
                </span>
                <span className="bm-age-footer">
                  <span>{card.label}</span>
                  <span className="bm-card-arrow" aria-hidden="true">
                    <ChevronRight size={26} strokeWidth={2.4} />
                  </span>
                </span>
              </button>
            ))}
          </div>

          <div className="bm-legal">
            <p>
              <strong>By choosing your age and continuing</strong> you agree to our{" "}
              <a href="#" onClick={(event) => event.preventDefault()}>
                Terms of Service
              </a>{" "}
              |{" "}
              <a href="#" onClick={(event) => event.preventDefault()}>
                Privacy Policy
              </a>
            </p>
            <p>Please review before continuing</p>
          </div>
        </section>
        <button className="bm-help-button" type="button">
          ? Help
        </button>
      </main>
    );
  }

  return (
    <main className="bm-quiz-page">
      <BetterMeHeader />
      <section className="bm-quiz-shell" aria-live="polite">
        <div className="bm-progress-row">
          <button className="bm-link-button" onClick={resetDemo} type="button">
            <RefreshCw size={16} />
            Reset
          </button>
          <div className="bm-progress-track" aria-label={`${progress}% complete`}>
            <span style={{ width: `${progress}%` }} />
          </div>
          <span className="bm-step-count">
            {stepIndex + 1}/{funnel.steps.length}
          </span>
        </div>

        <div className="bm-question-zone">
          <h1>{step.title}</h1>
          {step.description ? <p className="lede">{step.description}</p> : null}

          {step.questionImageUrl || step.imageUrl ? (
            <div className="bm-question-image">
              <img alt="" src={step.questionImageUrl ?? step.imageUrl ?? ""} />
            </div>
          ) : null}

          {step.type === "info" ? (
            <div className="bm-info-strip">
              <span>Low-impact training</span>
              <span>Server-calculated results</span>
              <span>Progress saved</span>
            </div>
          ) : null}

          {step.type === "question" && step.questionType !== "input" ? (
            <div className={step.questionType === "multi_select" ? "bm-option-grid compact" : "bm-option-grid"}>
              {step.options.map((option) => {
                const selected =
                  step.questionType === "multi_select"
                    ? Array.isArray(selectedValue) && selectedValue.includes(option.value)
                    : selectedValue === option.value;

                return (
                  <button
                    className={`bm-option-button ${selected ? "selected" : ""}`}
                    key={option.id}
                    onClick={() => {
                      if (step.questionType === "multi_select") {
                        const current = Array.isArray(selectedValue) ? selectedValue : [];
                        setAnswer(
                          step,
                          current.includes(option.value)
                            ? current.filter((value) => value !== option.value)
                            : [...current, option.value]
                        );
                      } else {
                        setAnswer(step, option.value);
                      }
                    }}
                    type="button"
                  >
                    {option.iconUrl ? (
                      <span className="bm-option-icon">
                        <img alt="" src={option.iconUrl} />
                      </span>
                    ) : null}
                    <span>{option.label}</span>
                    {selected ? <Check size={18} aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          {step.type === "question" && step.questionType === "input" ? (
            <label className="bm-number-field">
              <span>{step.input?.unit ? `Enter ${step.input.unit}` : "Enter value"}</span>
              <input
                inputMode="decimal"
                max={step.input?.max}
                min={step.input?.min}
                onChange={(event) => {
                  const numericValue = Number(event.target.value);
                  setAnswer(step, event.target.value === "" ? null : numericValue);
                }}
                placeholder={step.input?.placeholder}
                type="number"
                value={typeof selectedValue === "number" ? selectedValue : ""}
              />
            </label>
          ) : null}

          {error ? <p className="error-text">{error}</p> : null}
        </div>

        <div className="bm-nav-row">
          <button className="bm-secondary-button" disabled={stepIndex === 0 || isPending} onClick={handleBack} type="button">
            <ArrowLeft size={18} />
            Back
          </button>
          <button className="bm-primary-button" disabled={!canContinue || isPending} onClick={handleNext} type="button">
            {isPending ? <LoaderCircle className="spin" size={18} /> : null}
            {nextLabel}
            <ArrowRight size={18} />
          </button>
        </div>
      </section>
    </main>
  );
}
