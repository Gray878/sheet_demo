"use client";

import { ArrowLeft, ArrowRight, Check, ChevronRight, LoaderCircle, Menu, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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

type QuestionImageFit = "is-landscape" | "is-portrait" | "is-square";

const sessionStorageKey = "health_funnel_session_id";
const singleSelectFeedbackMs = 135;
const inputAutoAdvanceMs = 760;

const sensitiveQuestionKeys = new Set(["age", "heightCm", "currentWeightKg", "targetWeightKg", "gender"]);

const progressStages = [
  { label: "My Profile", maxProgress: 22 },
  { label: "Goals", maxProgress: 42 },
  { label: "Body", maxProgress: 62 },
  { label: "Habits", maxProgress: 86 },
  { label: "Plan", maxProgress: 100 }
];

const ageCards = [
  {
    label: "Age: 18-29",
    imageUrl: "https://cdn.gandalfpuzzle.com/temp/funnel/r9r7heaa3tj2b59ao8gv.webp"
  },
  {
    label: "Age: 30-39",
    imageUrl: "https://cdn.gandalfpuzzle.com/temp/funnel/ezhryf9gr4hypl4yuvek.webp"
  },
  {
    label: "Age: 40-49",
    imageUrl: "https://cdn.gandalfpuzzle.com/temp/funnel/zametd6l35xiqgoyg7qp.webp"
  },
  {
    label: "Age: 50+",
    imageUrl: "https://cdn.gandalfpuzzle.com/temp/funnel/kcrhcq05lujnbbjszq3w.webp"
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
  if (step.questionType === "input") {
    return (
      typeof value === "number" &&
      !Number.isNaN(value) &&
      value >= (step.input?.min ?? Number.NEGATIVE_INFINITY) &&
      value <= (step.input?.max ?? Number.POSITIVE_INFINITY)
    );
  }
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

function progressStageFor(progress: number) {
  return progressStages.find((stage) => progress <= stage.maxProgress)?.label ?? progressStages.at(-1)?.label ?? "Plan";
}

function questionSupportText(step: FunnelStep) {
  if (step.type !== "question") return null;
  if (step.questionType === "multi_select") return "Choose every option that feels true right now.";
  if (step.questionKey && sensitiveQuestionKeys.has(step.questionKey)) {
    return "Used only to calculate your plan. No account required.";
  }
  if (step.questionKey === "goal") return "Your answer shapes the training rhythm and timeline.";
  if (step.questionKey === "activityFrequency") return "This helps set a realistic starting pace.";
  return null;
}

function inputLabelFor(step: FunnelStep) {
  switch (step.questionKey) {
    case "age":
      return "Enter your age";
    case "heightCm":
      return "Enter your height";
    case "currentWeightKg":
      return "Enter your current weight";
    case "targetWeightKg":
      return "Enter your target weight";
    default:
      return "Enter value";
  }
}

export function FunnelClient() {
  const router = useRouter();
  const [isPending, startTransitionLocal] = useTransition();
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const advanceLockedRef = useRef(false);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepIndexRef = useRef(0);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [questionImageFits, setQuestionImageFits] = useState<Record<string, QuestionImageFit>>({});

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

  useEffect(() => {
    stepIndexRef.current = stepIndex;
    if (inputTimerRef.current) {
      clearTimeout(inputTimerRef.current);
      inputTimerRef.current = null;
    }
  }, [stepIndex]);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
      if (inputTimerRef.current) clearTimeout(inputTimerRef.current);
    };
  }, []);

  const step = funnel?.steps[stepIndex] ?? null;
  const progress = funnel ? Math.round(((stepIndex + 1) / funnel.steps.length) * 100) : 0;
  const activeProgressStage = progressStageFor(progress);
  const selectedValue = step?.questionKey ? answers[step.questionKey] : undefined;
  const canContinue = step ? hasValue(step, selectedValue) : false;
  const isBusy = isPending || saving;
  const questionMediaUrl = step?.questionImageUrl ?? step?.imageUrl ?? null;
  const questionImageFit = questionMediaUrl ? questionImageFits[questionMediaUrl] : undefined;
  const hasSideQuestionImage = questionImageFit === "is-portrait";
  const supportText = step ? questionSupportText(step) : null;

  const nextLabel = useMemo(() => {
    if (!funnel) return "Continue";
    return stepIndex === funnel.steps.length - 1 ? "Generate my plan" : "Continue";
  }, [funnel, stepIndex]);

  function setAnswer(step: FunnelStep, value: AnswerValue) {
    if (!step.questionKey) return;
    setError(null);
    setAnswers((current) => ({ ...current, [step.questionKey as string]: value }));
  }

  function rememberQuestionImageFit(url: string, image: HTMLImageElement) {
    const { naturalHeight, naturalWidth } = image;
    if (!naturalHeight || !naturalWidth) return;

    const heightToWidth = naturalHeight / naturalWidth;
    const nextFit: QuestionImageFit =
      heightToWidth > 1.16 ? "is-portrait" : heightToWidth < 0.9 ? "is-landscape" : "is-square";

    setQuestionImageFits((current) => {
      if (current[url] === nextFit) return current;
      return { ...current, [url]: nextFit };
    });
  }

  function renderQuestionImage(placement: "inline" | "side") {
    if (!questionMediaUrl) return null;

    if (!questionImageFit) {
      return placement === "inline" ? (
        <img
          alt=""
          className="bm-question-image-probe"
          onLoad={(event) => rememberQuestionImageFit(questionMediaUrl, event.currentTarget)}
          src={questionMediaUrl}
        />
      ) : null;
    }

    return (
      <div className={`bm-question-image ${questionImageFit} ${placement === "side" ? "side" : "inline"}`}>
        <img
          alt=""
          onLoad={(event) => rememberQuestionImageFit(questionMediaUrl, event.currentTarget)}
          src={questionMediaUrl}
        />
      </div>
    );
  }

  async function persistStepAnswer(stepToPersist: FunnelStep, targetIndex: number, value: AnswerValue | undefined) {
    if (stepToPersist.type !== "question" || !stepToPersist.questionKey || !sessionId) return;

    await api(`/api/sessions/${sessionId}/answers`, {
      method: "PATCH",
      body: JSON.stringify({
        currentStepIndex: targetIndex,
        answers: [
          {
            questionKey: stepToPersist.questionKey,
            questionId: stepToPersist.id,
            stepIndex: stepToPersist.stepIndex,
            answerType: stepToPersist.questionType,
            value
          }
        ]
      })
    });
  }

  function enqueuePersist(stepToPersist: FunnelStep, targetIndex: number, value: AnswerValue | undefined) {
    const queuedSave = saveQueueRef.current.then(() => persistStepAnswer(stepToPersist, targetIndex, value));
    saveQueueRef.current = queuedSave.catch(() => undefined);
    return queuedSave;
  }

  async function advanceFromCurrentStep(
    value: AnswerValue | undefined = selectedValue,
    options: { optimistic?: boolean; feedbackMs?: number } = {}
  ) {
    if (!funnel || !step || !sessionId) return;
    if (saving || advanceLockedRef.current) return;
    if (!hasValue(step, value)) {
      setError("Choose an answer to keep going.");
      return;
    }

    let shouldClearSaving = true;
    advanceLockedRef.current = true;

    try {
      setError(null);
      const isLastStep = stepIndex === funnel.steps.length - 1;
      const targetIndex = Math.min(stepIndex + 1, funnel.steps.length - 1);
      const sourceIndex = stepIndex;
      const savePromise = enqueuePersist(step, targetIndex, value);

      if (isLastStep) {
        setSaving(true);
        await savePromise;
        await api(`/api/sessions/${sessionId}/submit`, { method: "POST" });
        startTransitionLocal(() => router.push(`/result/${sessionId}`));
        return;
      }

      if (options.optimistic) {
        shouldClearSaving = false;
        setSaving(true);
        if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);

        transitionTimerRef.current = setTimeout(() => {
          setStepIndex(targetIndex);
          advanceLockedRef.current = false;
          setSaving(false);
          transitionTimerRef.current = null;
        }, options.feedbackMs ?? 0);

        savePromise.catch((saveError) => {
          if (transitionTimerRef.current) {
            clearTimeout(transitionTimerRef.current);
            transitionTimerRef.current = null;
          }
          advanceLockedRef.current = false;
          setSaving(false);
          setStepIndex((current) => (current === targetIndex ? sourceIndex : current));
          setError(saveError instanceof Error ? saveError.message : "Unable to save this answer");
        });
        return;
      }

      setSaving(true);
      await savePromise;
      setStepIndex(targetIndex);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save this step");
    } finally {
      if (shouldClearSaving) {
        advanceLockedRef.current = false;
        setSaving(false);
      }
    }
  }

  async function handleNext() {
    if (inputTimerRef.current) {
      clearTimeout(inputTimerRef.current);
      inputTimerRef.current = null;
    }
    await advanceFromCurrentStep();
  }

  function handleBack() {
    if (inputTimerRef.current) {
      clearTimeout(inputTimerRef.current);
      inputTimerRef.current = null;
    }
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

  function scheduleInputAutoAdvance(stepToAdvance: FunnelStep, value: AnswerValue) {
    if (inputTimerRef.current) clearTimeout(inputTimerRef.current);

    inputTimerRef.current = setTimeout(() => {
      inputTimerRef.current = null;
      if (stepIndexRef.current !== stepToAdvance.stepIndex) return;
      void advanceFromCurrentStep(value, { optimistic: true, feedbackMs: 90 });
    }, inputAutoAdvanceMs);
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
          <p className="bm-subtitle">Build a personalized Pilates plan in about a minute</p>
          <div className="bm-value-row" aria-label="Assessment benefits">
            <span>Personal timeline</span>
            <span>Calorie target</span>
            <span>No account required</span>
          </div>
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
      <section className={`bm-quiz-shell ${hasSideQuestionImage ? "has-side-image" : ""}`} aria-live="polite">
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
          <div className="bm-stage-row" aria-label={`Current section: ${activeProgressStage}`}>
            {progressStages.map((stage) => (
              <span className={stage.label === activeProgressStage ? "active" : ""} key={stage.label}>
                {stage.label}
              </span>
            ))}
          </div>
        </div>

        <div className={`bm-question-zone ${hasSideQuestionImage ? "with-side-image" : ""}`} key={step.id}>
          <div className="bm-question-content">
            <h1>{step.title}</h1>
            {supportText ? <p className="bm-question-support">{supportText}</p> : null}
            {step.description ? <p className="lede">{step.description}</p> : null}

            {renderQuestionImage("inline")}

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
                          void advanceFromCurrentStep(option.value, {
                            optimistic: true,
                            feedbackMs: singleSelectFeedbackMs
                          });
                        }
                      }}
                      disabled={isBusy}
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
                <span>{inputLabelFor(step)}</span>
                <span className="bm-number-input-wrap">
                  <input
                    inputMode="decimal"
                    max={step.input?.max}
                    min={step.input?.min}
                    onChange={(event) => {
                      const numericValue = Number(event.target.value);
                      const nextValue = event.target.value === "" ? null : numericValue;
                      setAnswer(step, nextValue);

                      if (inputTimerRef.current) {
                        clearTimeout(inputTimerRef.current);
                        inputTimerRef.current = null;
                      }

                      if (
                        typeof nextValue === "number" &&
                        !Number.isNaN(nextValue) &&
                        nextValue >= (step.input?.min ?? Number.NEGATIVE_INFINITY) &&
                        nextValue <= (step.input?.max ?? Number.POSITIVE_INFINITY)
                      ) {
                        scheduleInputAutoAdvance(step, nextValue);
                      }
                    }}
                    placeholder={step.input?.placeholder}
                    type="number"
                    value={typeof selectedValue === "number" ? selectedValue : ""}
                  />
                  {step.input?.unit ? <small>{step.input.unit}</small> : null}
                </span>
              </label>
            ) : null}

            {error ? <p className="error-text">{error}</p> : null}
          </div>

          {hasSideQuestionImage ? (
            <div className="bm-question-side-image" aria-hidden="true">
              {renderQuestionImage("side")}
            </div>
          ) : null}
        </div>

        <div className="bm-nav-row">
          <button className="bm-secondary-button" disabled={stepIndex === 0 || isBusy} onClick={handleBack} type="button">
            <ArrowLeft size={18} />
            Back
          </button>
          <button className="bm-primary-button" disabled={!canContinue || isBusy} onClick={handleNext} type="button">
            {isBusy ? <LoaderCircle className="spin" size={18} /> : null}
            {nextLabel}
            <ArrowRight size={18} />
          </button>
        </div>
      </section>
    </main>
  );
}
