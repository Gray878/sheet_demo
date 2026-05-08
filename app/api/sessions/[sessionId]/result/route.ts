import { fail, ok } from "@/src/lib/api-response";
import { getDifferentiatedResult } from "@/src/server/services/result-service";
import { sessionIdSchema } from "@/src/server/validation/session-schema";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await context.params;
    return ok(await getDifferentiatedResult(sessionIdSchema.parse(sessionId)));
  } catch (error) {
    return fail(error);
  }
}
