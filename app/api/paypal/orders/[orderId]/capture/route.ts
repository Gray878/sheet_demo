import { fail, ok } from "@/src/lib/api-response";
import { capturePayPalOrder } from "@/src/server/services/paypal-service";
import { paypalCaptureSchema, paypalOrderIdSchema } from "@/src/server/validation/payment-schema";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await context.params;
    const body = paypalCaptureSchema.parse(await request.json());
    return ok(await capturePayPalOrder(paypalOrderIdSchema.parse(orderId), body));
  } catch (error) {
    return fail(error);
  }
}
