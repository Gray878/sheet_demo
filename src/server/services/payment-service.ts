import { getRepository } from "@/src/server/repositories/app-repository";
import type { PaymentInput } from "@/src/server/validation/payment-schema";

export async function mockPay(input: PaymentInput) {
  const providerEventId = input.providerEventId ?? `mock_${input.sessionId}`;

  return getRepository().activateSubscription({
    sessionId: input.sessionId,
    providerEventId,
    amountCents: input.amountCents,
    currency: input.currency,
    rawPayload: input
  });
}
