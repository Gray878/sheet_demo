import { fail, ok } from "@/src/lib/api-response";
import { mockPay } from "@/src/server/services/payment-service";
import { paymentSchema } from "@/src/server/validation/payment-schema";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = paymentSchema.parse(await request.json());
    return ok(await mockPay(body));
  } catch (error) {
    return fail(error);
  }
}
