import { AppError } from "@/src/server/domain/errors";
import { getRepository } from "@/src/server/repositories/app-repository";
import type { PayPalCaptureInput, PayPalOrderInput } from "@/src/server/validation/payment-schema";

type PayPalAccessTokenResponse = {
  access_token?: string;
};

type PayPalOrderResponse = {
  id?: string;
  status?: string;
};

type PayPalCaptureResponse = {
  id?: string;
  status?: string;
  purchase_units?: Array<{
    reference_id?: string;
    custom_id?: string;
    payments?: {
      captures?: Array<{
        id?: string;
        status?: string;
        amount?: {
          currency_code?: string;
          value?: string;
        };
      }>;
    };
  }>;
};

const defaultAmountCents = 1900;
const defaultCurrency = "USD";

function getAmountCents() {
  const amount = Number(process.env.PAYPAL_PLAN_AMOUNT_CENTS ?? defaultAmountCents);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new AppError(500, "PAYPAL_CONFIG_ERROR", "PAYPAL_PLAN_AMOUNT_CENTS must be a positive integer");
  }
  return amount;
}

function getCurrency() {
  return (process.env.PAYPAL_CURRENCY ?? defaultCurrency).toUpperCase();
}

function formatPayPalAmount(amountCents: number) {
  return (amountCents / 100).toFixed(2);
}

function getPayPalBaseUrl() {
  if (process.env.PAYPAL_API_BASE_URL) return process.env.PAYPAL_API_BASE_URL.replace(/\/$/, "");
  return process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

function getClientId() {
  return process.env.PAYPAL_CLIENT_ID ?? process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
}

function getPublicClientId() {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? process.env.PAYPAL_CLIENT_ID;
  if (!clientId) {
    throw new AppError(503, "PAYPAL_NOT_CONFIGURED", "PayPal client id is not configured");
  }
  return clientId;
}

function getServerCredentials() {
  const clientId = getClientId();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new AppError(503, "PAYPAL_NOT_CONFIGURED", "PayPal server credentials are not configured");
  }

  return { clientId, clientSecret };
}

async function getAccessToken() {
  const { clientId, clientSecret } = getServerCredentials();
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${getPayPalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials",
    cache: "no-store"
  });
  const body = (await response.json().catch(() => ({}))) as PayPalAccessTokenResponse;

  if (!response.ok || !body.access_token) {
    throw new AppError(response.status || 502, "PAYPAL_AUTH_FAILED", "Unable to authenticate with PayPal", [body]);
  }

  return body.access_token;
}

async function paypalFetch<T>(path: string, init: RequestInit = {}) {
  const accessToken = await getAccessToken();
  const response = await fetch(`${getPayPalBaseUrl()}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...init.headers
    },
    cache: "no-store"
  });
  const body = (await response.json().catch(() => ({}))) as T;

  if (!response.ok) {
    throw new AppError(response.status || 502, "PAYPAL_REQUEST_FAILED", "PayPal request failed", [body]);
  }

  return body;
}

export function getPayPalPublicConfig() {
  const amountCents = getAmountCents();
  const currency = getCurrency();

  return {
    clientId: getPublicClientId(),
    currency,
    amountCents,
    amount: formatPayPalAmount(amountCents)
  };
}

export async function createPayPalOrder(input: PayPalOrderInput) {
  const session = await getRepository().getSession(input.sessionId);
  if (!session) throw new AppError(404, "NOT_FOUND", "Session not found");

  const amountCents = getAmountCents();
  const currency = getCurrency();
  const amount = formatPayPalAmount(amountCents);

  const order = await paypalFetch<PayPalOrderResponse>("/v2/checkout/orders", {
    method: "POST",
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.sessionId,
          custom_id: input.sessionId,
          description: "Bendwell Health Plan unlock",
          amount: {
            currency_code: currency,
            value: amount
          }
        }
      ],
      application_context: {
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW"
      }
    })
  });

  if (!order.id) {
    throw new AppError(502, "PAYPAL_ORDER_FAILED", "PayPal did not return an order id", [order]);
  }

  return {
    id: order.id,
    status: order.status ?? "CREATED"
  };
}

export async function capturePayPalOrder(orderId: string, input: PayPalCaptureInput) {
  const session = await getRepository().getSession(input.sessionId);
  if (!session) throw new AppError(404, "NOT_FOUND", "Session not found");

  const amountCents = getAmountCents();
  const currency = getCurrency();
  const amount = formatPayPalAmount(amountCents);
  const order = await paypalFetch<PayPalCaptureResponse>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST"
  });
  const purchaseUnit = order.purchase_units?.[0];
  const capture = purchaseUnit?.payments?.captures?.[0];

  if (order.status !== "COMPLETED" || capture?.status !== "COMPLETED" || !capture.id) {
    throw new AppError(502, "PAYPAL_CAPTURE_INCOMPLETE", "PayPal capture did not complete", [order]);
  }

  const capturedCurrency = capture.amount?.currency_code?.toUpperCase();
  if (capturedCurrency !== currency || capture.amount?.value !== amount) {
    throw new AppError(422, "PAYPAL_AMOUNT_MISMATCH", "Captured PayPal amount does not match the plan price", [order]);
  }

  const referenceMatches = purchaseUnit?.reference_id === input.sessionId || purchaseUnit?.custom_id === input.sessionId;
  if (!referenceMatches) {
    throw new AppError(422, "PAYPAL_SESSION_MISMATCH", "Captured PayPal order does not match this session", [order]);
  }

  return getRepository().activateSubscription({
    sessionId: input.sessionId,
    provider: "paypal",
    providerEventId: capture.id,
    providerOrderId: order.id ?? orderId,
    providerCaptureId: capture.id,
    amountCents,
    currency,
    rawPayload: order
  });
}
