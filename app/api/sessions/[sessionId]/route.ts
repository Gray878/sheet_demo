import { fail, ok } from "@/src/lib/api-response";
import { getSessionWithProgress } from "@/src/server/services/session-service";
import { sessionIdSchema } from "@/src/server/validation/session-schema";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await context.params;
    return ok(await getSessionWithProgress(sessionIdSchema.parse(sessionId)));
  } catch (error) {
    return fail(error);
  }
}
