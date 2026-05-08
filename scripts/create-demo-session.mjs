const appUrl = (process.env.APP_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const shouldPay = (process.env.PAID ?? "true").toLowerCase() !== "false";

async function api(path, init) {
  const response = await fetch(`${appUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers
    }
  });
  const text = await response.text();
  let body;

  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON from ${path}, received ${response.status}: ${text.slice(0, 180)}`);
  }

  if (!response.ok || body.error) {
    throw new Error(body.error?.message ?? `Request failed: ${path}`);
  }

  return body.data;
}

const funnel = await api("/api/funnels/default");
const session = await api("/api/sessions", { method: "POST" });
const sessionId = session.sessionId ?? session.id;

const demoValues = {
  gender: "female",
  goal: "lose_weight",
  activityFrequency: "moderate",
  age: 32,
  heightCm: 165,
  currentWeightKg: 72,
  targetWeightKg: 62
};

const answers = Object.entries(demoValues).map(([questionKey, value]) => {
  const step = funnel.steps.find((item) => item.questionKey === questionKey);
  if (!step) throw new Error(`Missing step for ${questionKey}`);

  return {
    questionKey,
    questionId: step.id,
    stepIndex: step.stepIndex,
    answerType: step.questionType,
    value
  };
});

await api(`/api/sessions/${sessionId}/answers`, {
  method: "PATCH",
  body: JSON.stringify({
    currentStepIndex: funnel.steps.length - 1,
    answers
  })
});

await api(`/api/sessions/${sessionId}/submit`, { method: "POST" });

if (shouldPay) {
  await api("/api/pay", {
    method: "POST",
    body: JSON.stringify({
      sessionId,
      providerEventId: `mock_${sessionId}`
    })
  });
}

const result = await api(`/api/sessions/${sessionId}/result`);

console.log(
  JSON.stringify(
    {
      appUrl,
      sessionId,
      resultUrl: `${appUrl}/result/${sessionId}`,
      paid: result.subscriptionStatus === "active",
      paywallRequired: result.paywall.required,
      resultKeys: Object.keys(result.result)
    },
    null,
    2
  )
);
