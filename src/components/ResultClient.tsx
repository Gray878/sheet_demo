"use client";

import { Activity, ArrowLeft, CalendarDays, Flame, Lock, Unlock } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

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

export function ResultClient({ sessionId }: { sessionId: string }) {
  const [payload, setPayload] = useState<ResultPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

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

  async function pay() {
    try {
      setPaying(true);
      await api("/api/pay", {
        method: "POST",
        body: JSON.stringify({
          sessionId,
          providerEventId: `mock_${sessionId}`
        })
      });
      await load();
    } catch (payError) {
      setError(payError instanceof Error ? payError.message : "Payment failed");
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

      {payload.paywall.required ? (
        <section className="unlock-band">
          <Lock size={24} />
          <div>
            <h2>Unlock the full projection</h2>
            <p>Mock payment flips the database subscription status to active and reloads the result endpoint.</p>
          </div>
          <button className="primary-button" disabled={paying} onClick={pay} type="button">
            {paying ? "Unlocking..." : "Mock pay"}
            <Unlock size={18} />
          </button>
        </section>
      ) : (
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
      )}
    </main>
  );
}
