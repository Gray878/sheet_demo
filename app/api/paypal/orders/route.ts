import { fail, ok } from "@/src/lib/api-response";
import { createPayPalOrder } from "@/src/server/services/paypal-service";
import { paypalOrderSchema } from "@/src/server/validation/payment-schema";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = paypalOrderSchema.parse(await request.json());
    return ok(await createPayPalOrder(body));
  } catch (error) {
    return fail(error);
  }
}
