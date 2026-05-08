import { z } from "zod";

export const paymentSchema = z.object({
  sessionId: z.string().uuid(),
  providerEventId: z.string().min(3).max(120).optional(),
  amountCents: z.number().int().positive().default(1900),
  currency: z.string().length(3).default("USD")
});

export type PaymentInput = z.infer<typeof paymentSchema>;
