import { fail, ok } from "@/src/lib/api-response";
import { getDefaultFunnel } from "@/src/server/domain/funnel";

export const runtime = "nodejs";

export async function GET() {
  try {
    return ok(getDefaultFunnel());
  } catch (error) {
    return fail(error);
  }
}
