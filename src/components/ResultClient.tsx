"use client";

import {
  Activity,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Flame,
  Sparkles,
  Unlock
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type ApiEnvelope<T> = {
  data: T | null;
  error: { code: string; message: string } | null;
};

type ResultPayload = {
  sessionId: string;
  subscriptionStatus: string;
  result: {
    bmi: number;
    bmiCategory: string;
    summary: {
      headline: string;
      body: string;
      riskFlags: string[];
    };
    estimatedWeeksRange?: string;
    estimatedWeeks?: number;
    recommendedCalories?: number;
    targetDate?: string;
    projectionCurve?: Array<{ week: number; weightKg: number }>;
    recommendations?: string[];
  };
  paywall: {
    required: boolean;
    reason?: string;
  };
};

type PayPalConfig = {
  clientId: string;
  currency: string;
  amountCents: number;
  amount: string;
};

type PayPalOrderPayload = {
  id: string;
  status: string;
};

type PayPalButtonInstance = {
  render: (container: HTMLElement) => Promise<void>;
  close?: () => Promise<void> | void;
  isEligible?: () => boolean;
};

type PayPalButtonsOptions = {
  style?: {
    layout?: "horizontal" | "vertical";
    shape?: "pill" | "rect";
    label?: "paypal" | "checkout" | "buynow" | "pay" | "installment" | "subscribe" | "donate";
    height?: number;
  };
  createOrder: () => Promise<string>;
  onApprove: (data: { orderID: string }) => Promise<void>;
  onCancel?: () => void;
  onError?: (error: unknown) => void;
};

declare global {
  interface Window {
    paypal?: {
      Buttons: (options: PayPalButtonsOptions) => PayPalButtonInstance;
    };
  }
}

const profileImageUrl = "https://cdn.gandalfpuzzle.com/temp/funnel/cvvfj4ahkspgm9w8qz70.webp";
const bmiScaleStart = 15;
const bmiScaleEnd = 40;
const bmiMarkers = [15, 18.5, 25, 30, 40];
let paypalScriptPromise: Promise<void> | null = null;

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

function bmiScalePosition(bmi: number) {
  const clamped = Math.min(bmiScaleEnd, Math.max(bmiScaleStart, bmi));
  const position = ((clamped - bmiScaleStart) / (bmiScaleEnd - bmiScaleStart)) * 100;
  return Math.min(96, Math.max(4, position));
}

function bmiInsightFor(category: string) {
  if (category === "normal") {
    return {
      title: "Healthy BMI",
      body: "A solid starting point for steady, realistic progress."
    };
  }

  if (category === "underweight") {
    return {
      title: "Lean baseline",
      body: "Your plan should prioritize strength, recovery, and enough fuel."
    };
  }

  if (category === "overweight") {
    return {
      title: "Clear starting point",
      body: "Low-impact training can make the first wins feel reachable."
    };
  }

  return {
    title: "Joint-friendly start",
    body: "Start with low impact while building repeatable movement habits."
  };
}

function bodyTypeFor(category: string) {
  if (category === "underweight") return "Lean";
  if (category === "normal") return "Balanced";
  if (category === "overweight") return "Momentum builder";
  return "Low-impact starter";
}

function loadPayPalScript(config: PayPalConfig) {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.paypal) return Promise.resolve();
  if (paypalScriptPromise) return paypalScriptPromise;

  paypalScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>("script[data-paypal-sdk]");
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Unable to load PayPal checkout")), {
        once: true
      });
      return;
    }

    const params = new URLSearchParams({
      "client-id": config.clientId,
      currency: config.currency,
      intent: "capture",
      components: "buttons",
      commit: "true"
    });
    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?${params.toString()}`;
    script.async = true;
    script.dataset.paypalSdk = "true";
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => {
        paypalScriptPromise = null;
        reject(new Error("Unable to load PayPal checkout"));
      },
      { once: true }
    );
    document.body.appendChild(script);
  });

  return paypalScriptPromise;
}

export function ResultClient({ sessionId }: { sessionId: string }) {
  const [payload, setPayload] = useState<ResultPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [paypalReady, setPaypalReady] = useState(false);
  const [paypalError, setPaypalError] = useState<string | null>(null);
  const paypalContainerRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    try {
      setError(null);
      setPayload(await api<ResultPayload>(`/api/sessions/${sessionId}/result`));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load result");
    }
  }

  useEffect(() => {
    load();
  }, [sessionId]);

  useEffect(() => {
    if (!payload?.paywall.required) return;

    let cancelled = false;
    let buttons: PayPalButtonInstance | null = null;

    async function renderPayPalButtons() {
      try {
        setPaypalReady(false);
        setPaypalError(null);
        const config = await api<PayPalConfig>("/api/paypal/config");
        await loadPayPalScript(config);

        if (cancelled || !paypalContainerRef.current || !window.paypal) return;
        paypalContainerRef.current.innerHTML = "";
        buttons = window.paypal.Buttons({
          style: {
            layout: "vertical",
            shape: "rect",
            label: "pay",
            height: 44
          },
          createOrder: async () => {
            setPaying(true);
            const order = await api<PayPalOrderPayload>("/api/paypal/orders", {
              method: "POST",
              body: JSON.stringify({ sessionId })
            });
            return order.id;
          },
          onApprove: async (data) => {
            try {
              await api(`/api/paypal/orders/${data.orderID}/capture`, {
                method: "POST",
                body: JSON.stringify({ sessionId })
              });
              await load();
            } catch (payError) {
              setPaypalError(payError instanceof Error ? payError.message : "Payment failed");
            } finally {
              setPaying(false);
            }
          },
          onCancel: () => {
            setPaying(false);
          },
          onError: (payError) => {
            console.error(payError);
            setPaying(false);
            setPaypalError("PayPal payment failed. Please try again.");
          }
        });

        if (buttons.isEligible && !buttons.isEligible()) {
          throw new Error("PayPal checkout is not available for this browser");
        }

        await buttons.render(paypalContainerRef.current);
        if (!cancelled) setPaypalReady(true);
      } catch (payError) {
        if (!cancelled) {
          setPaypalError(payError instanceof Error ? payError.message : "Unable to load PayPal checkout");
        }
      }
    }

    renderPayPalButtons();

    return () => {
      cancelled = true;
      if (paypalContainerRef.current) paypalContainerRef.current.innerHTML = "";
      void buttons?.close?.();
    };
  }, [payload?.paywall.required, sessionId]);

  async function mockPay() {
    try {
      setPaying(true);
      setPaypalError(null);
      await api("/api/pay", {
        method: "POST",
        body: JSON.stringify({
          sessionId,
          providerEventId: `mock_${sessionId}`
        })
      });
      await load();
    } catch (payError) {
      setPaypalError(payError instanceof Error ? payError.message : "Mock payment failed");
    } finally {
      setPaying(false);
    }
  }

  if (error) {
    return (
      <main className="shell center-shell">
        <p>{error}</p>
        <Link className="secondary-button" href="/">
          <ArrowLeft size={18} />
          Back to assessment
        </Link>
      </main>
    );
  }

  if (!payload) {
    return (
      <main className="shell center-shell">
        <p>Loading your plan...</p>
      </main>
    );
  }

  const curve = payload.result.projectionCurve ?? [];
  const maxWeight = Math.max(...curve.map((point) => point.weightKg), payload.result.bmi);
  const minWeight = Math.min(...curve.map((point) => point.weightKg), payload.result.bmi);
  const timelineLabel = payload.result.targetDate
    ? payload.result.targetDate
    : payload.result.estimatedWeeksRange
      ? `${payload.result.estimatedWeeksRange} weeks`
      : "Personalized";
  const bmiInsight = bmiInsightFor(payload.result.bmiCategory);

  if (payload.paywall.required) {
    return (
      <main className="result-shell paywall-result-shell">
        <section className="wellness-hero">
          <h1>Your wellness profile</h1>
          <p className="lede">Unlock calories, timeline, and weekly guidance.</p>
        </section>

        <section className="wellness-profile-grid" aria-label="Wellness profile preview">
          <div className="wellness-card bmi-profile-card">
            <div>
              <h2>Body Mass Index (BMI)</h2>
            </div>

            <div className="bmi-scale" aria-label={`BMI ${payload.result.bmi}`}>
              <div className="bmi-pointer" style={{ left: `${bmiScalePosition(payload.result.bmi)}%` }}>
                You - {payload.result.bmi}
              </div>
              <div className="bmi-scale-labels">
                {bmiMarkers.map((marker) => (
                  <span key={marker}>{marker}</span>
                ))}
              </div>
              <div className="bmi-gradient-track">
                <span style={{ left: `${bmiScalePosition(payload.result.bmi)}%` }} />
              </div>
              <div className="bmi-scale-cats">
                <span>Underweight</span>
                <span>Normal</span>
                <span>Overweight</span>
                <span>Obese</span>
              </div>
            </div>

            <div className="bmi-insight-card">
              <CheckCircle2 size={22} />
              <div>
                <strong>{bmiInsight.title}</strong>
                <p>{bmiInsight.body}</p>
              </div>
            </div>

            <div className="profile-highlight-row">
              <span>
                <Activity size={18} />
                {bodyTypeFor(payload.result.bmiCategory)}
              </span>
              <span>
                <CalendarDays size={18} />
                {timelineLabel}
              </span>
            </div>

            <div className="profile-data-grid" aria-label="Locked plan preview">
              <div>
                <span>BMI</span>
                <strong>{payload.result.bmi}</strong>
                <small>{payload.result.bmiCategory}</small>
              </div>
              <div>
                <span>Calories</span>
                <strong>Locked</strong>
                <small>Daily target</small>
              </div>
              <div>
                <span>Plan</span>
                <strong>Pilates</strong>
                <small>Low impact</small>
              </div>
              <div>
                <span>Path</span>
                <strong>{timelineLabel}</strong>
                <small>Estimate</small>
              </div>
            </div>
          </div>

          <div className="profile-visual-card">
            <img alt="" src={profileImageUrl} />
            <div className="profile-visual-caption">
              <Sparkles size={16} />
              <strong>Plan preview</strong>
            </div>
          </div>
        </section>

        <section className="profile-unlock-panel">
          <div>
            <h2>Unlock your full plan</h2>
            <div className="unlock-feature-list" aria-label="Unlocked plan includes">
              <span>
                <CheckCircle2 size={16} />
                Calories
              </span>
              <span>
                <CheckCircle2 size={16} />
                Timeline
              </span>
              <span>
                <CheckCircle2 size={16} />
                Weekly path
              </span>
            </div>
          </div>
          <div className="payment-action-stack" aria-live="polite">
            <div aria-label="PayPal checkout">
              {!paypalReady && !paypalError ? <p>Loading PayPal checkout...</p> : null}
              <div ref={paypalContainerRef} />
            </div>
            <button className="primary-button" disabled={paying} onClick={mockPay} type="button">
              {paying ? "Unlocking..." : "Mock pay"}
              <Unlock size={18} />
            </button>
            {paying ? <small>Completing payment...</small> : null}
            {paypalError ? <small>{paypalError}</small> : null}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="result-shell">
      <section className="result-header">
        <Link className="ghost-button" href="/">
          <ArrowLeft size={16} />
          Assessment
        </Link>
        <div>
          <p className="kicker">Your server-side health snapshot</p>
          <h1>{payload.result.summary.headline}</h1>
          <p className="lede">{payload.result.summary.body}</p>
        </div>
      </section>

      <section className="metric-grid">
        <div className="metric-tile">
          <Activity size={22} />
          <span>BMI</span>
          <strong>{payload.result.bmi}</strong>
          <small>{payload.result.bmiCategory}</small>
        </div>
        <div className="metric-tile">
          <CalendarDays size={22} />
          <span>Timeline</span>
          <strong>{payload.result.targetDate ?? `${payload.result.estimatedWeeksRange} weeks`}</strong>
          <small>{payload.paywall.required ? "Exact date locked" : "Target date"}</small>
        </div>
        <div className="metric-tile">
          <Flame size={22} />
          <span>Calories</span>
          <strong>{payload.result.recommendedCalories ?? "Locked"}</strong>
          <small>{payload.paywall.required ? "Unlock target" : "Daily target"}</small>
        </div>
      </section>

      <section className="plan-grid">
        <div className="curve-panel">
          <h2>Weight projection</h2>
          <div className="curve-bars">
            {curve.map((point) => {
              const range = Math.max(1, maxWeight - minWeight);
              const height = 30 + ((point.weightKg - minWeight) / range) * 120;
              return (
                <span key={point.week} style={{ height }}>
                  <small>{point.weightKg}</small>
                </span>
              );
            })}
          </div>
        </div>
        <div className="recommendation-panel">
          <h2>Next moves</h2>
          <ul>
            {(payload.result.recommendations ?? []).map((recommendation) => (
              <li key={recommendation}>{recommendation}</li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
