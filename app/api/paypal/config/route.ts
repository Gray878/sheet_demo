import { fail, ok } from "@/src/lib/api-response";
import { getPayPalPublicConfig } from "@/src/server/services/paypal-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    return ok(getPayPalPublicConfig());
  } catch (error) {
    return fail(error);
  }
}
